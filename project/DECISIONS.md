# FIRST AI — Architectural decisions

Choix étayés par le code et les références du repository. « Adopté » ne signifie
pas que toute la vision future est livrée. Ne modifier ce fichier que lorsqu'un
choix architectural change ou qu'un nouveau choix est explicitement établi.

## ADR-01 — Monorepo TypeScript/pnpm

- **Statut :** adopté, implémenté.
- **Décision :** apps web/worker séparées, packages typés partagés, strict TypeScript et pnpm unique.
- **Raison :** frontières claires et contrats réutilisables sans frameworks concurrents.
- **Conséquence :** UI ne porte pas la logique métier ; worker reste une coquille tant que les queues sont différées.
- **Sources :** `pnpm-workspace.yaml`, `tsconfig.base.json`, `ARCHITECTURE.md`.

## ADR-02 — Drizzle, seule histoire de migrations applicatives

- **Statut :** adopté, implémenté.
- **Décision :** schéma/repositories Drizzle et migrations versionnées dans `packages/database/drizzle/`.
  Supabase CLI fournit le runtime local ; ses migrations/seeds sont désactivés.
- **Raison :** éviter deux histoires concurrentes et des modifications DB non traçables.
- **Conséquence :** inspecter aussi le SQL custom Auth/RLS des migrations initiales,
  absent de certaines déclarations Drizzle ; ne pas modifier les migrations appliquées ni utiliser push comme migration.
- **Sources :** `DATABASE.md`, `packages/database/drizzle.config.ts`, `supabase/config.toml`.

## ADR-03 — Identité Auth distincte du membership métier

- **Statut :** adopté, implémenté.
- **Décision :** Supabase Auth authentifie ; `public.users.auth_user_id` unique/FK rattache
  cette identité au rôle et à l'organisation First AI.
- **Raison :** ne pas confondre compte d'authentification et utilisateur métier.
- **Conséquence :** modèle actuel à une organisation par identité, sans membership multi-organisation.
- **Sources :** `packages/auth/src/current-user.ts`, migrations 0000/0001.

## ADR-04 — Tenant explicite et intégrité relationnelle

- **Statut :** adopté, implémenté.
- **Décision :** données métier liées à organization_id, repositories scopés et FK
  composites sur relations sensibles ; quote_items porte aussi organization_id.
- **Raison :** empêcher fuite et corruption inter-organisations au-delà des contrôles UI.
- **Conséquence :** tests de tenant et d'UUID connus obligatoires ; références futures non inventées.
- **Sources :** `SECURITY.md`, migrations 0001/0003/0004/0006, repositories database.

## ADR-05 — Contexte organisationnel de confiance côté serveur

- **Statut :** adopté, implémenté.
- **Décision :** résoudre session → users → organizationId/role ; injecter ce contexte
  dans services/tools. Aucun scope navigateur/LLM ne fait autorité.
- **Raison :** bloquer manipulation d'ID de tenant et élévation de privilèges.
- **Conséquence :** refaire authentification/autorisation aux frontières serveur, même si un bouton est masqué.
- **Sources :** `packages/auth/src/current-user.ts`, `apps/web/lib/auth.ts`, `packages/agents/src/director/tools.ts`.

## ADR-06 — Défense en profondeur, sans supposer la parité de toutes les policies

- **Statut :** adopté, implémenté ; durcissement membership/prospects en migration 0007.
- **Décision :** RLS + scoping explicite des queries privilégiées + permissions des
  services + contraintes PostgreSQL complémentaires.
- **Raison :** la connexion Drizzle peut contourner RLS ; le frontend n'est pas une barrière.
- **Conséquence :** contexte serveur et helper RLS exigent user/organisation actifs
  et non supprimés. Leads SELECT autorise OWNER/ADMIN/MANAGER/READ_ONLY, avec la
  même matrice que le service. Le lookup de rôle lit users sous RLS ; son helper
  SECURITY DEFINER est sans argument, search_path vide, réservé à authenticated,
  donc sans récursion ni choix arbitraire de tenant. Ne pas supposer un RBAC universel
  sur toutes les tables ; writes métier passent toujours par services.
- **Sources :** `SECURITY.md` §§3/7, `packages/auth/src/current-user.ts`,
  `packages/auth/src/permissions.ts`, `packages/database/drizzle/0007_security_hardening.sql`.

## ADR-07 — Tool → service → repository

- **Statut :** adopté, implémenté.
- **Décision :** les tools valident un contrat précis et réutilisent les services
  autorisés ; les repositories gèrent la persistence. Les actions humaines réutilisent ces services.
- **Raison :** mêmes invariants pour UI et IA, sans accès SQL/shell/HTTP arbitraire aux agents.
- **Conséquence :** observabilité Director à la frontière tool ; audit financier humain ciblé M5A (ADR-25), audit métier universel différé.
- **Sources :** `TOOLS.md`, `packages/tools/src/crm-tools.ts`, `packages/tools/src/operational-tools.ts`.

## ADR-08 — Director v1 strictement read-only

- **Statut :** adopté, implémenté.
- **Décision :** exécution Director texte, autonomie 0, allowlist Risk 0 et permissions
  de lecture vérifiées en code ; aucune mutation ni délégation récursive par modèle.
  La frontière Assistant peut orienter vers un unique spécialiste avant inférence (ADR-17).
- **Raison :** établir une assistance traçable sans confier l'autorisation aux prompts.
- **Conséquence :** les outils d'écriture existants ne sont pas disponibles à Director, sur aucun provider.
- **Sources :** `docs/agents/director-v1.md`, `packages/agents/src/director/config.ts`, `packages/agents/src/director/tools.ts`.

## ADR-09 — Providers Ollama/OpenAI derrière un port commun

- **Statut :** adopté, implémenté.
- **Décision :** `AiProvider`, Ollama natif et OpenAI Agents SDK, sans logique CRM
  dupliquée. Modes LOCAL_ONLY/HYBRID/CLOUD_ONLY ; fallback local → cloud explicite et borné.
- **Raison :** modèles interchangeables et CRM utilisable même si un provider tombe.
- **Conséquence :** même tenant/run/budget/outils pendant fallback ; LOCAL_ONLY n'appelle jamais OpenAI.
  Ollama loopback uniquement ; concurrence locale par processus, pas scheduler distribué.
- **Sources :** `docs/architecture/hybrid-ai.md`, `packages/agents/src/providers/provider.ts`, `packages/agents/src/hybrid-executor.ts`.

## ADR-10 — Modèles runtime configurables par organisation

- **Statut :** adopté, implémenté.
- **Décision :** quatre profils hybrides, paramètres `ai_settings` relus par run,
  modifications OWNER/ADMIN ; environnement pour secrets et defaults seulement.
- **Raison :** changer de modèle/matériel sans modifier le code ou redémarrer.
- **Conséquence :** aucun download applicatif, aucun API secret en table ; anciens profils SQL conservés.
- **Sources :** `packages/agents/src/ai-settings-service.ts`, `packages/agents/src/hybrid-router.ts`, migration 0005.

## ADR-11 — Classification déterministe des workloads

- **Statut :** adopté, implémenté.
- **Décision :** cinq classes par heuristiques textuelles, puis sélection profil/provider
  selon mode tenant et configuration agent ; pas de LLM classificateur par requête.
- **Raison :** coût/latence bornés et routage testable.
- **Conséquence :** heuristiques imparfaites ; routing sensible ne crée aucun droit ni domaine finance/fiscalité.
- **Sources :** `packages/agents/src/hybrid-router.ts`, `packages/agents/src/hybrid.test.ts`.

## ADR-12 — Calculs monétaires déterministes hors LLM

- **Statut :** adopté, implémenté pour devis/marges estimées, factures et soldes paiements.
- **Décision :** NUMERIC et DTO décimaux, BigInt fixed-point, arrondi par ligne,
  TVA explicite par item et marge sur HT. Snapshots de totaux mis à jour dans la transaction des lignes.
- **Raison :** résultats exacts, reproductibles et indépendants du provider.
- **Conséquence :** coût par unité ; ratio sur revenu, null à revenu nul. Pas de coût réel ni pricing intelligent supposé.
- **Sources :** `packages/tools/src/quote-calculation.ts`, `docs/architecture/quotes-jobs.md`.

## ADR-13 — Toute mutation IA Risk 1+ exige une approbation humaine

- **Statut :** accepté, workflow persistant v1 implémenté pour le registre des spécialistes.
- **Décision :** Risk 0 lecture/analyse peut s'exécuter directement avec autorisation.
  Toute mutation/action IA Risk 1+ exige l'approbation explicite d'un humain autorisé
  avant exécution, sur une action allowlistée déterministe et ses paramètres précis.
  Aucune auto-approbation, approbation générique ou simple instruction de chat.
- **Raison :** séparer proposition IA, autorité humaine et exécution autorisée.
- **Conséquence :** revalidation du membership, des permissions, du tenant et des
  invariants métier à l'exécution ; aucun droit supplémentaire accordé par approval.
  Jamais de code/SQL/shell ou exécution arbitraire générés par modèle. Workflow
  traçable, expirant et protégé contre double exécution. Les spécialistes créent
  seulement des propositions ; Director conserve ses tools Risk 0. L'exécution
  humaine suit le registre et les services, jamais le code généré par modèle.
  Remplace les possibilités d'autonomie Risk 1/2 précédemment envisagées dans TOOLS.
- **Sources :** `SECURITY.md` §13, `TOOLS.md` §5, `AGENTS.md` §§34/143, allowlist Director.

## ADR-14 — Traces utiles, pas de chaîne de pensée persistée

- **Statut :** adopté, implémenté.
- **Décision :** persister objectif/résultat/tool input-output expurgés, statut,
  compteurs et usage ; pas d'historique SDK ni raisonnement privé. RLS des traces au déclencheur.
- **Raison :** traçabilité locale sans exposer reasoning privé ou données d'un autre rôle.
- **Conséquence :** redaction limitée aux formats reconnus, pas une garantie de détecter tout secret ; coût null sans pricing fiable.
- **Sources :** `packages/agents/src/run-agent.ts`, `packages/agents/src/sanitize.ts`, migration 0004.

## ADR-15 — Scope opérationnel minimal et relations différées

- **Statut :** adopté, implémenté.
- **Décision :** omettre les FK/colonnes des domaines absents ; assigned_user_id
  et report.technician_id référencent les users actuels, sans faux employees.
- **Raison :** livrer devis/interventions/rapports sans créer toute la roadmap DB.
- **Conséquence :** une future phase employés/documents exige une migration/mapping explicites ; pas de RH, signature ou stock implicite.
- **Sources :** `packages/database/src/schema/operations.ts`, `docs/architecture/quotes-jobs.md`.

## ADR-16 — Numérotation et acceptation atomiques

- **Statut :** adopté, implémenté.
- **Décision :** numéro tenant/année sous verrou organisation ; acceptation sous
  verrou devis + insertion d'un seul job, dans la même transaction, avec prestation principale explicite.
- **Raison :** éviter collisions et interventions dupliquées lors de retries concurrents.
- **Conséquence :** numéros supprimés réservés, capacité 999 999/an/tenant ; un job pour tout le devis,
  pas une visite par ligne. Rapport unique, finalisé immuable avant achèvement du job.
- **Sources :** repositories/services operations, migration 0006, tests opérationnels.

## ADR-17 — Spécialistes supervisés, délégation déterministe unique

- **Statut :** adopté, implémenté v1.
- **Décision :** choisir Pricing/Planning/Technician à la frontière serveur par
  intention ou sélection explicite validée ; une seule inférence spécialisée,
  aucun handoff récursif. Même hybrid router, contexte, limites, outils et traces.
- **Raison :** garder la latence/RAM bornées et les règles métier indépendantes des providers.
- **Conséquence :** heuristiques imparfaites, priorité Pricing puis Planning ; sélection
  manuelle disponible. Modèles ne reçoivent que lectures autorisées/proposals, sans
  accès aux mutations ni décisions d'approbation.
- **Sources :** `packages/agents/src/specialists.ts`, `docs/agents/specialists-v1.md`.

## ADR-18 — Approbation idempotente atomique, liée au demandeur

- **Statut :** adopté, implémenté v1.
- **Décision :** une table approval_requests, payload strict par action allowlistée,
  expiry 30 minutes, fingerprint serveur ; seul le demandeur humain peut décider.
  Relire/verrouiller membership/organisation actifs et rôle, puis proposition/état
  métier ; services existants sous savepoints, mutation et reçu dans la même transaction.
- **Raison :** empêcher autorisation périmée, actions modifiées et double exécution.
- **Conséquence :** même receipt lors d'un retry exécuté ; erreurs rollback puis failed.
  Rejet/expiry/failed requièrent une nouvelle proposition, aucun replay de mutation.
  Pas de notification, cross-user approver, inbox exhaustive ni audit/event général.
- **Sources :** `packages/tools/src/approval-service.ts`, `packages/database/src/repositories/approvals.ts`, migration 0008.

## ADR-19 — Encaissements manuels et soldes transactionnels

- **Statut :** adopté, implémenté v1.
- **Décision :** payments constitue la source des encaissements enregistrés ; soldes/statut
  facture dérivés exactement sous verrou facture, avec mutation et snapshots dans une
  transaction. Clé idempotente tenant ; correction tracée par annulation, sans suppression.
- **Raison :** éviter doublons, trop-perçus concurrents et divergence paiement/solde.
- **Conséquence :** seule une facture émise peut recevoir des fonds déjà reçus ; aucun
  transfert/remboursement, rapprochement ou paiement IA. Membership/rôle actifs revérifiés
  sous verrou. Toute administration privilégiée doit préserver le service, pas éditer
  directement les snapshots. Les statuts bancaires et crédits non alloués sont différés.
- **Sources :** `docs/architecture/payments.md`, PaymentService/PaymentRepository, migration 0011.

## ADR-20 — Corps de facture immuable, copie PDF et paiements actuels séparés

- **Statut :** adopté, implémenté v1 technique.
- **Décision :** capturer un snapshot JSONB versionné dans la transaction d’émission,
  depuis les identités réelles et calculs exacts. Protéger snapshot/champs commerciaux
  SQL ; depuis M5B préserver le PDF original à l’émission hors DB (ADR-26).
  Une copie explicitement distincte affiche les encaissements actuels déclaratifs,
  jamais une modification du corps ni des bytes originaux.
- **Raison :** un changement CRM ne doit pas réécrire une facture ; les paiements
  évoluent indépendamment, avec une source structurée et un solde cohérent.
- **Conséquences :** aucun backfill des factures historiques ; vendeur incomplet
  bloque l’émission. Adresse client absente explicitement signalée, pas substituée
  par un site. PDF Unicode embarqué depuis M6 (ADR-27), refus de glyphes incompatibles. Conformité fiscale,
  rectificatifs complémentaires, rétention de production et e-invoicing restent différés ;
  avoirs M4 et audit financier M5A étendent ce socle. Identités/adresses
  client et configuration vendeur sont désormais étendues par ADR-21, sans backfill.
- **Sources :** `docs/architecture/invoice-documents.md`, InvoiceService, migration 0012.

## ADR-21 — Identités structurées, qualification explicite et snapshot v2

- **Statut :** adopté, implémenté M1.
- **Décision :** colonnes relationnelles sur organizations/customers/invoices, adresse
  de facturation distincte du site, classifications explicites et contrôles de scénario
  à l’émission ; snapshot JSONB v2 seulement pour les nouveaux documents.
- **Raison :** aucune identité fiscale ne peut être inventée ou déduite d’un segment
  CRM ; les documents historiques ne doivent pas être réécrits depuis le profil courant.
- **Conséquences :** configuration vendeur OWNER/ADMIN, client par rôles de facturation ;
  membership/permissions relus aux accès. Émission domestique FR cadrée uniquement,
  cas internationaux/autres refusés ; v1 inchangé. Pas de certification d’identifiants
  ni de conformité globale ; snapshot v3 et cycle de numéro désormais étendus par ADR-22.
- **Sources :** `docs/architecture/billing-identities.md`, schémas/services billing,
  migration `0013_tiresome_komodo.sql`.

## ADR-22 — Numéro fiscal et date alloués lors de l’émission

- **Statut :** adopté, implémenté M2, sans certification fiscale globale.
- **Décision :** référence interne UUID au brouillon ; compteur transactionnel durable
  tenant/année FAC, advisory lock tenant, heure PostgreSQL et date civile du fuseau
  organisation. Allocation, validation M1/calcul exact et snapshot v3 dans la même transaction.
- **Raison :** ordre de création des brouillons, abandon et rollback ne doivent pas
  dicter la chronologie ni consommer la séquence des factures émises. Pas de nextval.
- **Conséquences :** retry garde le document, numéro/date émis immuables y compris legacy ;
  aucune reprise d’un numéro supprimé. Séries annuelles à qualifier par l’émetteur,
  historique conservé avec ses éventuels trous ; import/multi-émetteurs et antidatage
  différés. Horloge/date reculant bloque l’émission. Guards/compteur privé ne remplacent
  ni audit fiscal certifié ni archivage M5B ; audit runtime M5A ajouté par ADR-25.
  Seules transactions complètes du service appellent l’allocateur.
- **Sources :** `docs/architecture/invoice-numbering.md`, InvoiceService/InvoiceRepository,
  migrations 0014/0015, audit §5/M2 et BOFiP §§70–140.

## ADR-23 — Dates confirmées et mentions conditionnelles figées

- **Statut :** adopté, implémenté M3 ; conformité globale non établie.
- **Décision :** données métier explicitement saisies, termes vendeur structurés,
  remise acquise HT par ligne/frais positifs distincts, snapshot v4 atomique à l’émission.
  Applicabilité B2B/B2C/B2G déterministe ; aucune clause ou date issue d’un LLM.
- **Raison :** un taux zéro, un site ou un timestamp ne qualifie pas une opération ;
  termes futurs et données CRM modifiées ne doivent pas réécrire le document émis.
- **Conséquences :** configuration incomplète bloque l’émission sans numéro consommé.
  Périmètre domestique ordinaire seulement ; acomptes, exceptions sectorielles et
  clauses publiques exhaustives restent à cadrer. V1/v2/v3 inchangés, M4–M7 distincts.
- **Sources :** `docs/architecture/invoice-mentions.md`, migration 0016, audit M3.

## ADR-24 — Avoir séparé et allocation cumulative de TVA

- **Statut :** adopté, implémenté M4 ; conformité fiscale globale non établie.
- **Décision :** correction réductive dédiée, ligne référencée par index du snapshot
  original immuable (compatible legacy sans UUID item), montants HT positifs et
  TVA cumulée au prorata de la TVA arrondie originale. Série AV transactionnelle
  indépendante, issue avec snapshot et solde sous verrou de la facture partagé avec paiements.
- **Raison :** ne jamais réécrire l’original ni sur-corriger bases/TVA ; distinguer
  dette corrigée, argent déclaré reçu et crédit client sans simuler un remboursement.
- **Conséquences :** pas de quantités retournées inventées, de facture de remplacement
  ni de réallocation crédit inter-factures. Original/snapshot v1–v4 inchangés ; avoir v1.
  Les avoirs émis/lignes sont protégés SQL ; M5A complète suppression/audit financier,
  archivage et garanties contre administration propriétaire restent M5B. Aucun outil/action IA financier ajouté.
- **Sources :** `docs/architecture/credit-notes.md`, migrations 0017/0018, audit M4.

## ADR-25 — Audit financier atomique et guards runtime, sans faux archivage

- **Statut :** adopté, implémenté M5A ; conformité fiscale globale non établie.
- **Décision :** journal financier append-only borné, événements de mutation par
  triggers dans la même transaction, configuration par service/repository ; acteur
  transaction-local issu du contexte serveur et membership actif revérifié en SQL.
  Contenu fiscal/lignes/numéros/dates émis figés, paiement corrigé par annulation
  explicite, soldes revalidés au commit ; notes internes administratives OWNER/ADMIN auditées.
- **Raison :** éviter mutations silencieuses et événements de succès orphelins,
  conserver originaux et historique sans dupliquer profils ou secrets.
- **Conséquences :** couverture à partir du déploiement seulement, sans backfill.
  RLS/consultation réservée aux rôles financiers hors READ_ONLY/TECHNICIAN.
  Aucun bypass runtime ; cleanup propriétaire strictement local et fixture-scopé
  dans les tests. Propriétaire DB peut encore désactiver les protections : M5B
  doit cadrer privilèges/rétention/archive, pas de promesse WORM ni audit fiscal certifié.
- **Sources :** `docs/architecture/financial-audit.md`, migrations 0019/0020.

## ADR-26 — Original financier préservé et archive vérifiable, sans faux restore

- **Statut :** adopté, implémenté M5B ; conformité fiscale globale non établie.
- **Décision :** politique de clôture annuelle explicite et versionnée, échéance depuis
  clôture, pas anniversaire facture. PDF original généré à l’émission, SHA-256 et metadata
  immuables, adapter serveur local sans delete/overwrite ; issue/metadata/audit atomiques
  en PostgreSQL. Copie de situation de paiement séparée, legacy sans faux original.
- **Raison :** snapshots seuls ne conservent pas les bytes délivrés après évolution
  renderer ; hash sans stockage/lecture/restauration vérifiée ne constitue pas une archive.
- **Conséquences :** export JSON/manifest borné sans nouvelle dépendance, vérification
  offline sans restore DB. Échéance inconnue si clôture non déclarée ; pas de backfill
  ni purge automatique. DB/filesystem pas atomiques ensemble : orphelin possible au rollback.
  Stockage/backup/restore durables, exercices atypiques, contrôle propriétaire et WORM
  ne sont pas certifiés ni fournis par ce socle local. Adapter remplaçable ultérieurement.
- **Sources :** `docs/architecture/financial-retention.md`, migration 0021.

## ADR-27 — Fontes Unicode locales partagées et renderer financier versionné

- **Statut :** adopté, implémenté M6 ; pas de certification fiscale/PDF/A.
- **Décision :** PDFKit avec Noto Sans Regular/Bold OFL 1.1 embarquées uniquement
  serveur, paths fixes, couverture vérifiée ; pas de fallback système/réseau ou `?`.
  Glyphes absents refusés explicitement ; version renderer incrémentée pour nouvelles
  émissions, originaux antérieurs jamais régénérés. Reconstruction legacy reste déclarée.
- **Raison :** accepter des identités françaises/européennes hors WinAnsi sans
  dépendance runtime externe ni altération silencieuse des documents conservés.
- **Conséquences :** seulement deux fontes, couverture non universelle ; vérifier
  l’adapter privé Fontkit lors d’un upgrade PDFKit. Fontes/renderer différents donnent
  de nouveaux bytes/hashes, pas une mise à jour des originaux. Aucune migration.
- **Sources :** `docs/architecture/pdf-unicode.md`, `packages/tools/assets/fonts/OFL.txt`.
