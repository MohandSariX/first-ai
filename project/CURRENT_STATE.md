# FIRST AI — Current state

Photographie du repository inspecté le 2026-10-05, pas un historique ni une preuve
de déploiement. Les références détaillées restent dans les documents fondateurs
et `docs/`. Remplacer les informations obsolètes après chaque jalon.

## Architecture actuelle

- Monorepo pnpm : `apps/web`, `apps/worker` et les sept packages `agents`, `auth`,
  `database`, `schemas`, `tools`, `ui`, `shared`. TypeScript strict partagé.
- Web : Next.js App Router 16, React 19, Tailwind 4 ; rendu serveur, actions serveur
  et composants interactifs ciblés. UI opérationnelle majoritairement française.
- `database` : PostgreSQL/Drizzle, migrations, repositories et transactions.
  `schemas` : Zod 4/DTO. `tools` : services métier et registres d'outils.
  `auth` : sessions, membership, rôles et permissions. `agents` : Director/spécialistes/providers/routage.
  `ui` : composants présentatifs/Markdown sûr. `shared` reste minimal.
- Flux manuel : page/action → service → repository → DB. Flux IA : agent → outil
  autorisé/validé → même service → repository. Les agents n'ont pas d'accès SQL métier.
- Supabase local configuré dans `supabase/config.toml` : PostgreSQL 17 et Auth ;
  Storage activé mais sans fonctionnalité documentaire applicative. Worker limité
  au démarrage/health, sans queue ni tâche autonome. Pas de PWA installable/offline implémentée.

## Authentification, tenancy et permissions

- Connexion e-mail/mot de passe via Supabase SSR/cookies. L'identité `auth.users`
  est distincte de `public.users` ; `users.auth_user_id` est unique et lié par FK.
  Une identité correspond à un utilisateur métier et une organisation.
- Le serveur résout `{ authUserId, userId, organizationId, role }` depuis la session
  et le membership, jamais depuis un formulaire, une URL ou des arguments LLM.
  Il exige explicitement user et organisation `status = active`, non soft-deleted ;
  les autres statuts sont refusés, indépendamment de la validité de la session Auth.
- RLS isole les tenants ; `public.current_organization_id()` utilise `auth.uid()`
  et `public.users`, avec SECURITY DEFINER, search_path vide et exécution réservée
  à authenticated. Les repositories Drizzle privilégiés filtrent explicitement le tenant.
  Les FK composites empêchent les références inter-organisations importantes.
  Le helper exige aussi membership/organisation actifs et non supprimés : révocation
  des lectures tenant même avec JWT encore valide. Leads RLS suit `leads.read` :
  OWNER/ADMIN/MANAGER/READ_ONLY ; TECHNICIAN/ACCOUNTANT ne lisent aucun prospect,
  y compris par UUID connu. Les permissions des services restent obligatoires.
- Services et outils appliquent la matrice de `packages/auth/src/permissions.ts` :
  OWNER/ADMIN/MANAGER lisent/écrivent CRM et opérations ; TECHNICIAN lit les données
  CRM opérationnelles, exécute ses interventions assignées et édite ses propres
  rapports brouillons, sans prospects/devis ; ACCOUNTANT lit CRM hors prospects,
  devis/interventions, sans rapports ni mutations CRM/opérationnelles ; il possède
  cependant invoices.read/write/issue et payments.read/write. TECHNICIAN n’accède ni aux factures ni aux paiements ;
  READ_ONLY consulte seulement.
- Écritures métier via services côté serveur, sans policies SQL d'écriture
  authenticated. Exception : `ai_settings` autorise INSERT/UPDATE OWNER/ADMIN du tenant.
  Service-role et secrets restent serveur ; `.env.local` et runtime sont ignorés.

## Base actuelle

19 tables applicatives `public` (hors tables internes Supabase et suivi Drizzle) :

- Identité/CRM : `organizations`, `users`, `customers`, `contacts`, `customer_sites`,
  `leads`, `services`.
- Opérations : `quotes`, `quote_items`, `jobs`, `job_reports`.
- Facturation : `invoices`, `invoice_items`, `payments`.
- IA : `agents`, `agent_runs`, `agent_tool_calls`, `ai_settings`, `approval_requests`.

Treize migrations 0000–0012 dans `packages/database/drizzle/`, seule source de migration
applicative. Dernière : `0012_flawless_havok.sql`, snapshot document JSONB facture,
trigger de capture obligatoire à l’émission et protection d’immutabilité commerciale.
Les anciennes migrations restent inchangées. Appliquées au Supabase local,
second passage sûr via tracking Drizzle ; aucune application distante effectuée.
UUID, timestamptz UTC, montants NUMERIC/chaînes décimales ; soft-delete des entités
CRM et devis/interventions. Le SQL custom des migrations porte aussi la sécurité
Auth/CRM, non intégralement représentée dans les déclarations Drizzle.

## Capacités métier présentes

- CRM : recherche/pagination, création/édition/archivage des clients côté service,
  contacts/sites avec cohérence client, prospects avec statut/score manuel/assignation,
  catalogue avec prix/durée et activation. UI : créer client/contact/site/prospect,
  changer statut/assignation prospect, créer/éditer/activer les prestations.
- Devis : brouillon puis lignes éditables, calcul exact BigInt avec TVA par ligne,
  arrondi au centime par ligne, marge = HT − coût estimé. Coût de ligne unitaire ×
  quantité ; taux de marge sur revenu HT, null si revenu nul. Maximum 200 lignes.
  Numéros `DEV-YYYY-000001` par tenant/année, verrou organisation et contrainte unique.
- Acceptation explicite d'un devis prêt/envoyé/consulté : une transaction crée
  exactement une intervention brouillon pour tout le devis, avec prestation principale
  choisie et montants HT hérités. Retries concurrents idempotents. Refus disponible.
- Interventions : recherche/date/statut, création, planification/replanification,
  affectation à un user TECHNICIAN actif, prévention des chevauchements, démarrage,
  finalisation et annulation. Dates UTC ; filtres journaliers dans le fuseau organisation.
- Rapports : un rapport par intervention démarrée, brouillon éditable, observations/
  traitement obligatoires à finalisation, rapport finalisé immuable. Finalisation
  requise avant fin d'intervention ; suivi recommandé flag/date, sans job automatique.
  Coûts/marges réels non calculés. Détails mobiles sans table horizontale.
- Factures : création manuelle de brouillons, recherche/statut/pagination, lignes
  éditables et totaux HT/TVA/TTC exacts via le moteur BigInt des devis. Numérotation
  FAC-YYYY-000001 par tenant/année de date d’émission, verrou organisation/unique.
  Émission explicite d’un brouillon non vide, lignes ensuite figées ; retry idempotent.
  Annulation de brouillon seulement. Liens facultatifs devis accepté/intervention
  terminée, client/tenant cohérents et états revalidés à l’émission. Pas de conversion
  automatique ni de règle supposée « une facture par source ». Détails :
  `docs/architecture/invoices.md`. Envoi/perte conservés dans l’enum sans opérations.
- Document facture : snapshot Zod/versionné figé atomiquement à l’émission avec
  identités vendeur/client, lignes, dates, numéro, notes client, totaux et TVA par taux.
  Seller = champs organizations existants, nom/adresse/code postal/ville/pays requis
  avant émission ; aucun identifiant inventé. PDFKit serveur génère à la demande
  un vrai PDF français, indépendant du CRM live, avec encart d’encaissements actualisé
  déclaratif/non vérifié par banque. Pas de stockage PDF ni IA. Download authentifié,
  membership/rôle courants revérifiés ; READ_ONLY autorisé, TECHNICIAN refusé.
  `docs/architecture/invoice-documents.md` décrit les limites fiscales explicites.
- Paiements : saisie manuelle de fonds déjà reçus sur facture émise, NUMERIC/BigInt,
  encaissements partiels/complets, montant reçu/reste dû et statut dérivés. Verrou facture,
  clé anti-doublon, rejet trop-perçu ; paiement + solde dans une transaction. Rôle et
  membership/organisation actifs relus et verrouillés avant écriture. Annulation de saisie
  avec motif/auteur/date sans suppression ni remboursement. UI paginée dans le détail
  facture ; aucune intégration bancaire ni outil IA paiement. `docs/architecture/payments.md`.

## Director et IA hybride

- `director:v1` reste texte/français/lecture seule à l'inférence.
  22 outils allowlistés Risk 0 puis filtrés par rôle : lectures CRM/catalogue,
  cinq agrégats CRM, `quotes.get/search`, `jobs.get/search/getToday`, `jobReports.get`.
  Les registres comprennent des outils Risk 1 de création/brouillon, mais Director
  ne les reçoit jamais. La frontière Assistant route au plus un spécialiste par
  intention déterministe ou sélection explicite : `pricing:v1`, `planning:v1`,
  `technician:v1`. Pas de handoff récursif ni de modèles locaux parallèles.
- Pricing lit clients/sites/catalogue/devis et calcule via le service déterministe ;
  propose brouillon, ajout/modification de ligne, passage prêt, jamais acceptation.
  Planning lit interventions/techniciens autorisés et propose créneau/replanification/
  affectation. Technician lit les interventions accessibles et propose démarrage,
  brouillon/modification/finalisation rapport puis fin de job, sans procédures chimiques inventées.
- Les spécialistes ne reçoivent aucune mutation métier directe. `proposals.*`
  persiste uniquement une action allowlistée strictement validée. Seul le demandeur
  humain décide ; expiry 30 min, pending/approved/rejected/executed/expired/failed.
  Approbation : session fraîche, membership/organisation actifs et rôle relus sous
  verrou, scope, payload, fingerprint métier et invariants services revérifiés.
  Mutation + receipt dans une transaction, services sous savepoints ; retries
  concurrents exécutent une fois. Rejet/périmé/failed ne sont pas exécutables.
- `AiProvider` : Ollama natif `/api/tags`/`/api/chat` et OpenAI via `@openai/agents`.
  Même contexte serveur figé, outils, budgets et logs sur les deux chemins.
- `ai_settings` : configuration persistante par tenant, HYBRID par défaut ;
  LOCAL_ONLY interdit le cloud, CLOUD_ONLY saute Ollama. OWNER/ADMIN modifient
  `/settings/ai` ; découverte locale ou saisie manuelle, aucun téléchargement automatique.
  Paramètres relus à chaque run, sans rebuild/restart ni clé API en DB.

| Profil runtime | Modèle par défaut, remplaçable |
| --- | --- |
| LOCAL_FAST | qwen3:1.7b |
| LOCAL_STANDARD | qwen3:4b-instruct |
| CLOUD_STANDARD | gpt-5.4-mini |
| CLOUD_REASONING | gpt-5.4 |

Ce sont les defaults du code, pas une lecture des paramètres privés d'un tenant.
Les anciens FAST/STANDARD/REASONING restent dans l'enum SQL pour compatibilité.
Routage heuristique : SIMPLE_LOOKUP → local rapide ; SUMMARY/STANDARD_ANALYSIS →
local standard ; COMPLEX_REASONING/SENSITIVE_REASONING → cloud reasoning en HYBRID.
Fallback local → cloud borné et optionnel seulement sur indisponibilité, modèle absent,
timeout ou réponse invalide, avec le même run/contexte/budget. Jamais pour contourner
un refus d'autorisation. URL Ollama limitée à HTTP localhost/127.0.0.1.

Bornes Director : 6 tours, 12 appels, 0 délégation, 60 s, 30 000 tokens observés ;
local : une exécution par processus, 35 s, contexte 8 192, sortie 512 tokens/tour.
Cloud : sortie 1 500 tokens/tour. Aucune tarification monétaire inventée.

## UI et observabilité

Routes protégées : `/dashboard`, `/customers`, `/customers/[id]`, `/leads`, `/services`,
`/quotes`, `/quotes/[id]`, `/jobs`, `/jobs/[id]`, `/assistant`, `/settings/ai`.
Facturation protégée : `/invoices`, `/invoices/[id]`, dans le menu mobile secondaire.
`GET /api/invoices/[id]/pdf` : invoices.read, lookup tenant, active membership,
PDF attachment/no-store ; aucun document public ni preview brouillon.
`/` redirige vers dashboard ; `/login` et `GET /api/health` sont publics.
`POST /api/assistant` exige session, même origine et input Zod strict/borné.
`GET/POST /api/assistant/proposals` liste les 20 dernières propositions propres et
traite la décision humaine. Assistant partagé : sélection spécialiste, cartes
verticales action/valeurs/risque/statut, confirmation Approve/Reject et lien résultat.
Navigation desktop et mobile à cinq destinations principales + menu secondaire.
Dashboard : vrais comptes CRM, devis en attente, interventions du jour et prospects récents.

Définitions des quatre agents créées par tenant/version ; runs et tool calls persistés via
port de stockage : objectif/résultats expurgés, statut, dates, corrélation, compteurs,
tokens, provider/modèle/profil/routage/fallback. RLS des traces restreinte au déclencheur.
Run spécialisé : agentCode/delegatedBy dans le résultat ; proposal tool call lié à
approval_request_id avec approval_required. RLS approvals : demandeur/tenant, aucune écriture SQL utilisateur.
Coût estimé null ; pas de chaîne de pensée ni historique SDK persisté. Chat visible
limité à 20 messages locaux, seul le message courant envoyé, Markdown allowlisté sûr.
Pas encore de viewer de traces ni d'audit complet des mutations humaines.

## Limitations et domaines différés

- Approvals v1 : seulement les actions du registre fermé ; pas d'acceptation IA de
  devis, cross-user approver, notifications, batch, cancellation ni inbox exhaustive.
  Expiry évaluée à la décision, sans scheduler. L'humain doit vérifier les valeurs
  proposées ; validation technique n'est pas validation commerciale automatique.
- La parité RBAC/RLS n'est pas un catalogue universel : hors restrictions spécifiques,
  certaines policies restent tenant-only. Les services restent la frontière métier.
  Un contexte privilégié déjà résolu n'est pas révoqué en cours d'exécution ; les
  approbations différées, mutations paiements, émission et téléchargement facture
  revérifient/verrouillent membership/organisation/rôle.
- Références opportunities/contracts/pest_types/employees/documents temporairement
  omises ; assignment et auteur de rapport référencent des users, pas des employés.
  Un devis → un job ; un job → un rapport. Pas de split-visites, envoi de devis,
  photos/signatures, disponibilité RH/certifications, trajets ni coûts réels détaillés.
- Facturation : PDF technique disponible, **conformité fiscale non validée** ;
  aucune adresse de facturation client dédiée : snapshot null et avertissement visible,
  jamais adresse de site supposée. Profil vendeur administré hors UI dédiée.
  Factures historiques sans snapshot non téléchargeables, sans backfill inventé.
  Polices PDF WinAnsi/français ; glyphes non supportés refusés explicitement.
  Snapshot/corps protégés SQL ; édition des lignes protégée par services, pas WORM
  ni audit/rétention fiscale complet contre administration privilégiée.
  Pas d’email/avoirs/export ou Billing Agent ;
  corrections après émission et cardinalité de facturation partielle à cadrer.
  Audit fiscal français documentaire terminé au 2026-10-05 ; corrections non
  implémentées, conformité non établie. Numéros réservés dès le brouillon : ordre
  et continuité à l’émission non garantis. Identités/mentions/TVA conditionnelles,
  corrections/avoirs et conservation originale restent à implémenter/valider.
  Aucune plateforme de réception/émission ni e-reporting ; qualification fiscale
  de l’émetteur et du suivi encaissement B2C requise avant production.
  Voir [audit et spécification](../docs/compliance/france-invoicing-audit.md).
  Aucun audit complet des mutations factures simulé. Le sous-titre `/invoices`
  dit encore « Aucun paiement, PDF ou envoi » : texte obsolète, non corrigé par l’audit.
  Outils invoices.get/search préparés Risk 0, non enregistrés avec les agents.
  Paiements manuels seulement, sans preuve bancaire/rapprochement, crédit non alloué
  ou remboursement. Les corrections peuvent remettre une facture à issued, sans
  reconstruire un ancien statut d’envoi/retard. Writes SQL privilégiés hors services
  peuvent contourner les invariants agrégés ; aucun audit complet simulé.
- Hors implémentation : autres spécialistes, autonomie/queues, mémoire IA/conversations
  persistées, audit_logs/domain_events/tasks, finance/Qonto/Stripe/prélèvements,
  contrats/stocks/achats/RH, knowledge/pricing intelligence, voix et offline/PWA.
  MFA et onboarding avancé restent différés ; performance live Ollama dépend du matériel.

## Tests et prochain jalon

Suites présentes : Vitest métier/calculs/permissions/routage/providers mockés ;
intégration locale DB/Auth/services (RLS, UUID connus, FK, numérotation/concurrence,
atomicité, approvals/concurrence/révocation/stale/conflicts, facturation/RLS/calculs) ;
scénarios Playwright CRM, Assistant/settings, devis → job → rapport mobile,
approbation mobile et brouillon → émission → encaissement partiel/complet/correction mobile.
`pnpm test` ne nécessite aucun runtime externe ; `pnpm test:integration` et
`pnpm test:e2e` utilisent des fixtures fictives/cleanup et refusent les URLs non locales.
`pnpm test:ollama` est opt-in/local ; aucun script `test:openai` n'existe.
Scripts aussi présents : `lint`, `typecheck`, `build`, `db:generate/migrate/studio`,
`supabase:start/stop/status`. Validation document/PDF au 2026-10-05 : lint,
typecheck, build, 178 tests unitaires, 68 intégrations locales et six E2E passent.
Migration 0012 appliquée localement, second passage sûr via tracking. Six tests
unitaires document/PDF et quatre intégrations ajoutés ; E2E téléchargement/refus
d’accès ajouté sans provider IA. PDFs courts/multipages rendus et vérifiés visuellement.
Smoke Pricing Ollama (qwen3:4b-instruct) : lecture/calcul déterministe réussi ;
la suite live optionnelle du jalon précédent a un échec sur son ancien smoke CRM
(timeout local 35 s) ; elle n’a pas été réexécutée pour la facturation.
Les limites restent inchangées ; cloud mocké seulement, aucune validation production.
Audit fiscal documentaire du 2026-10-05 : suites non réexécutées, aucune migration
ni modification applicative ; PDF fictif existant rendu et inspecté.

Prochain jalon : qualification fiscale des flux/émetteurs et obligations déjà
applicables (M0), puis **identités/adresses de facturation et classification** (M1).
Numérotation à l’émission et mentions viennent ensuite ; avoirs, rétention/Unicode
et intégration électronique restent des jalons distincts, selon priorité applicable.
Le plan détaillé est dans l’audit ; aucun correctif ni connecteur n’est livré.
Voir [ROADMAP](ROADMAP.md), [TASKS](TASKS.md) et [DECISIONS](DECISIONS.md).
