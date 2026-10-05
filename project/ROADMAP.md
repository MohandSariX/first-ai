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
- Spécialistes v1 Pricing/Planning/Technician, routage Director déterministe unique,
  propositions persistées, approbation humaine revalidée/idempotente et Assistant partagé.

## CURRENT

Spécialistes v1 livrés en mode supervisé uniquement. Aucun autre chantier actif.
Director reste read-only ; toute exécution d'une proposition exige l'humain autorisé.

## NEXT

- Consolider evals et scénarios métier des spécialistes, sans accroître automatiquement l'autonomie.
- Examiner rétention, contrôle d'abus et inbox des approvals avant usage production.
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
