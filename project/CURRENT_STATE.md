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
  `auth` : sessions, membership, rôles et permissions. `agents` : Director/providers/routage.
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
- RLS isole les tenants ; `public.current_organization_id()` utilise `auth.uid()`
  et `public.users`, avec SECURITY DEFINER, search_path vide et exécution réservée
  à authenticated. Les repositories Drizzle privilégiés filtrent explicitement le tenant.
  Les FK composites empêchent les références inter-organisations importantes.
- Services et outils appliquent la matrice de `packages/auth/src/permissions.ts` :
  OWNER/ADMIN/MANAGER lisent/écrivent CRM et opérations ; TECHNICIAN lit les données
  CRM opérationnelles, exécute ses interventions assignées et édite ses propres
  rapports brouillons, sans prospects/devis ; ACCOUNTANT lit CRM hors prospects,
  devis/interventions, sans rapports ni mutations ; READ_ONLY consulte seulement.
- Écritures métier via services côté serveur, sans policies SQL d'écriture
  authenticated. Exception : `ai_settings` autorise INSERT/UPDATE OWNER/ADMIN du tenant.
  Service-role et secrets restent serveur ; `.env.local` et runtime sont ignorés.

## Base actuelle

15 tables applicatives `public` (hors tables internes Supabase et suivi Drizzle) :

- Identité/CRM : `organizations`, `users`, `customers`, `contacts`, `customer_sites`,
  `leads`, `services`.
- Opérations : `quotes`, `quote_items`, `jobs`, `job_reports`.
- IA : `agents`, `agent_runs`, `agent_tool_calls`, `ai_settings`.

Sept migrations 0000–0006 dans `packages/database/drizzle/`, seule source de migration
applicative. Dernière : `0006_amused_exiles.sql` (opérations, intégrité, indexes, RLS).
UUID, timestamptz UTC, montants NUMERIC/chaînes décimales ; soft-delete des entités
CRM et devis/interventions. Le SQL des migrations porte aussi la sécurité initiale
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

## Director et IA hybride

- Seul agent implémenté : `director:v1`, texte, mono-agent, français, lecture seule.
  22 outils allowlistés Risk 0 puis filtrés par rôle : lectures CRM/catalogue,
  cinq agrégats CRM, `quotes.get/search`, `jobs.get/search/getToday`, `jobReports.get`.
  Les registres comprennent des outils Risk 1 de création/brouillon, mais Director
  ne les reçoit jamais. Aucun handoff ni mutation IA.
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
`/` redirige vers dashboard ; `/login` et `GET /api/health` sont publics.
`POST /api/assistant` exige session, même origine et input Zod strict/borné.
Navigation desktop et mobile à cinq destinations principales + menu secondaire.
Dashboard : vrais comptes CRM, devis en attente, interventions du jour et prospects récents.

Définitions Director créées par tenant/version ; runs et tool calls persistés via
port de stockage : objectif/résultats expurgés, statut, dates, corrélation, compteurs,
tokens, provider/modèle/profil/routage/fallback. RLS des traces restreinte au déclencheur.
Coût estimé null ; pas de chaîne de pensée ni historique SDK persisté. Chat visible
limité à 20 messages locaux, seul le message courant envoyé, Markdown allowlisté sûr.
Pas encore de viewer de traces ni d'audit complet des mutations humaines.

## Limitations et domaines différés

- Le resolver de membership ne contrôle pas explicitement le statut actif du user
  ou de l'organisation ; le helper SQL exclut les users soft-deleted, pas les inactifs.
- Les policies RLS `leads` sont tenant-only : les restrictions TECHNICIAN/ACCOUNTANT
  sont appliquées dans services/tools, pas dans les lectures directes Supabase de prospects.
  Ne pas présenter cette protection applicative comme une parité RBAC complète en DB.
- Pas d'approvals persistées/exécutables ; les colonnes/statuts d'approbation des traces
  sont des réservations. Pas de politique universelle d'approbation Risk 1+ établie.
- Références opportunities/contracts/pest_types/employees/documents temporairement
  omises ; assignment et auteur de rapport référencent des users, pas des employés.
  Un devis → un job ; un job → un rapport. Pas de split-visites, envoi de devis,
  photos/signatures, disponibilité RH/certifications, trajets ni coûts réels détaillés.
- Hors implémentation : spécialistes, autonomie/queues, mémoire IA/conversations
  persistées, audit_logs/domain_events/tasks, factures/paiements/finance/Qonto,
  contrats/stocks/achats/RH, knowledge/pricing intelligence, voix et offline/PWA.
  MFA et onboarding avancé restent différés ; performance live Ollama dépend du matériel.

## Tests et prochain jalon

Suites présentes : Vitest métier/calculs/permissions/routage/providers mockés ;
intégration locale DB/Auth/services (RLS, UUID connus, FK, numérotation/concurrence,
atomicité) ; trois scénarios Playwright CRM, Assistant/settings et devis → job → rapport mobile.
`pnpm test` ne nécessite aucun runtime externe ; `pnpm test:integration` et
`pnpm test:e2e` utilisent des fixtures fictives/cleanup et refusent les URLs non locales.
`pnpm test:ollama` est opt-in/local ; aucun script `test:openai` n'existe.
Scripts aussi présents : `lint`, `typecheck`, `build`, `db:generate/migrate/studio`,
`supabase:start/stop/status`. Ce jalon Markdown ne réexécute pas ces suites et ne
certifie pas leur état live ; validation limitée à la cohérence documentaire/Git.

Prochain jalon ciblé, non implémenté : fondation des agents spécialisés + système
d'approbation humaine, puis Pricing Agent, Planning Agent et Technician Agent.
Voir [ROADMAP](ROADMAP.md), [TASKS](TASKS.md) et [DECISIONS](DECISIONS.md).
