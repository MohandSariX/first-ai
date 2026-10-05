# FIRST AI — Roadmap

Direction du projet, sans échéances fictives. L'état livré est détaillé dans
[CURRENT_STATE](CURRENT_STATE.md) ; les actions immédiates dans [TASKS](TASKS.md).
Une entrée prévue n'est ni une fonctionnalité existante ni une autorisation d'exécution.

## COMPLETED

- Monorepo TypeScript/pnpm, web Next.js, worker minimal, validation/test infrastructure.
- Supabase local + Auth, membership public.users, isolation tenant/RLS, repositories scopés.
- CRM clients/contacts/sites/prospects/catalogue, services, permissions, outils et UI.
- Director v1 texte/read-only, traces runs/tool calls et frontière serveur authentifiée.
- Architecture hybride Ollama/OpenAI, modèles configurables par tenant, routage/fallback
  bornés, settings UI et Markdown sûr.
- Devis/lignes/calculs exacts/numérotation, acceptation transactionnelle vers un job,
  planification/affectation, rapports terrain et UI mobile avec tests opérationnels.
- Mémoire de projet documentaire : snapshot, roadmap, décisions, tâches et maintenance AGENTS.
- Durcissement sécurité : membership user/organisation actif et non supprimé,
  RLS prospects alignée aux rôles de lecture, tests de révocation et politique
  acceptée d'approbation humaine obligatoire pour toute mutation/action IA Risk 1+.

## CURRENT

Prochain jalon ciblé : **fondation des agents spécialisés + approbation humaine +
Pricing Agent + Planning Agent + Technician Agent**. Cadrage, pas encore livré.

- Définir contrats versionnés, contextes minimaux, allowlists et budgets des spécialistes.
- Construire un workflow humain explicite : proposition, décision autorisée, expiration,
  revalidation avant exécution, audit et protection contre double exécution/auto-approbation.
  Appliquer la politique Risk 1+ acceptée ; aucune exposition d'écriture IA avant ce workflow.
- Pricing : recommandation et préparation supervisée, calculs déterministes réutilisés.
- Planning : proposition et exécution supervisée, sans prétendre disposer de données RH/trajectoires absentes.
- Technician : interventions assignées et préparation supervisée de rapports terrain.
- Ajouter evals de permissions, tenant, injection, approvals et limites pour chaque spécialiste.

Director v1 reste read-only ; aucun spécialiste ou workflow d'approbation n'est activé par cette roadmap.

## NEXT

- Consolider l'orchestration limitée de spécialistes après validation du jalon CURRENT.
- Compléter audit/événements et consultation des traces selon les besoins effectivement introduits.
- Voix et expérience terrain PWA, avec rétention audio et tests dédiés.
- Étendre les visites/suivis, données de disponibilité/certifications et coûts opérationnels
  seulement avec un modèle métier explicite.

## LATER

- Factures/paiements/pré-comptabilité/finance, puis Qonto **lecture seule**.
- Contrats, stocks/produits/fournisseurs, documents/signatures, RH/conformité et domaines CRM avancés.
- Autres spécialistes commerciaux/qualité/finance/croissance, activation progressive.
- Worker/queues/outbox, notifications et autonomie supervisée mesurée, jamais sans limites.
- Mémoire IA/knowledge/provenance, learning candidates et pricing intelligence validée.
- Durcissement production : MFA, contrôles d'abus, observabilité, rétention, staging,
  sauvegarde/restauration et architecture réseau locale/cloud revue.
