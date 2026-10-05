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

- **Statut :** adopté, implémenté avec limites recensées dans CURRENT_STATE.
- **Décision :** RLS + scoping explicite des queries privilégiées + permissions des
  services + contraintes PostgreSQL complémentaires.
- **Raison :** la connexion Drizzle peut contourner RLS ; le frontend n'est pas une barrière.
- **Conséquence :** ne pas assimiler RLS tenant-only à un RBAC complet : notamment leads.
  Contrôles de statut actif du membership à compléter ; writes métier passent par services.
- **Sources :** `SECURITY.md`, `packages/auth/src/permissions.ts`, migrations et repositories.

## ADR-07 — Tool → service → repository

- **Statut :** adopté, implémenté.
- **Décision :** les tools valident un contrat précis et réutilisent les services
  autorisés ; les repositories gèrent la persistence. Les actions humaines réutilisent ces services.
- **Raison :** mêmes invariants pour UI et IA, sans accès SQL/shell/HTTP arbitraire aux agents.
- **Conséquence :** observabilité Director à la frontière tool ; audit métier humain complet différé, pas simulé.
- **Sources :** `TOOLS.md`, `packages/tools/src/crm-tools.ts`, `packages/tools/src/operational-tools.ts`.

## ADR-08 — Director v1 strictement read-only

- **Statut :** adopté, implémenté.
- **Décision :** un seul agent texte, autonomie 0, allowlist Risk 0 et permissions
  de lecture vérifiées en code ; aucune délégation ni mutation.
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

- **Statut :** adopté, implémenté pour devis/marges estimées.
- **Décision :** NUMERIC et DTO décimaux, BigInt fixed-point, arrondi par ligne,
  TVA explicite par item et marge sur HT. Snapshots de totaux mis à jour dans la transaction des lignes.
- **Raison :** résultats exacts, reproductibles et indépendants du provider.
- **Conséquence :** coût par unité ; ratio sur revenu, null à revenu nul. Pas de coût réel ni pricing intelligent supposé.
- **Sources :** `packages/tools/src/quote-calculation.ts`, `docs/architecture/quotes-jobs.md`.

## ADR-13 — Approbation humaine : principe établi, extension Risk 1+ non tranchée

- **Statut :** principes adoptés dans les références ; système à implémenter.
- **Décision :** actions sensibles Risk 3/4 soumises à validation humaine selon les
  références sécurité ; un agent ne s'approuve jamais. Director v1 ne reçoit aucun Risk 1+.
- **Raison :** séparer proposition IA, autorité humaine et exécution autorisée.
- **Conséquence :** aucune table/service/UI d'approval actuellement. `TOOLS.md` permet
  Risk 1/2 selon autonomie : une obligation universelle d'approbation de toute mutation
  IA Risk 1+ n'est donc **pas** une décision déjà établie. La politique du prochain
  jalon doit être explicitement arrêtée avant d'exposer des outils d'écriture à un spécialiste.
- **Sources :** `SECURITY.md` §§12–13, `TOOLS.md` §§5/57/68, `AGENTS.md` §§34/143, allowlist Director.

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
