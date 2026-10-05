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
- Fondation factures/lignes : calculs exacts, numérotation serveur, liens tenant/client,
  permissions/RLS, services et UI manuelle brouillon/émission, sans paiements ni IA write.
- Suivi manuel des paiements : encaissements partiels/complets, soldes/statuts exacts,
  idempotence, protection trop-perçu/concurrence, corrections tracées, RLS et UI mobile.
- Document facture : snapshot immuable à l’émission, PDF serveur à la demande,
  TVA multi-taux, encart paiements actualisé, téléchargement sécurisé et tests.
  Fondation technique uniquement, sans certification fiscale.

## CURRENT

Fondation document/PDF facture livrée ; aucun chantier produit actif.
Spécialistes toujours supervisés et Director read-only. Aucun mouvement bancaire,
envoi, rapprochement ou élargissement du registre IA dans ce jalon.

## NEXT

- **FISCAL / INVOICE COMPLIANCE** : champs obligatoires/adresse facturation client,
  numérotation/chronologie, corrections/avoirs, TVA/mentions, rétention, facturation
  électronique française et immutabilité/audit production, avant usage fiscal réel.
- Cadrer facturation partielle/source et configuration du profil vendeur en UI.
- Consolider evals et scénarios métier des spécialistes, sans accroître automatiquement l'autonomie.
- Examiner rétention, contrôle d'abus et inbox des approvals avant usage production.
- Compléter audit/événements et consultation des traces selon les besoins effectivement introduits.
- Voix et expérience terrain PWA, avec rétention audio et tests dédiés.
- Étendre les visites/suivis, données de disponibilité/certifications et coûts opérationnels
  seulement avec un modèle métier explicite.

## LATER

- Extension facturation/envoi, pré-comptabilité/finance/rapprochement,
  puis Qonto **lecture seule** ; aucun prélèvement/Stripe/relance automatique livré.
- Contrats, stocks/produits/fournisseurs, documents/signatures, RH/conformité et domaines CRM avancés.
- Autres spécialistes commerciaux/qualité/finance/croissance, activation progressive.
- Worker/queues/outbox, notifications et autonomie supervisée mesurée, jamais sans limites.
- Mémoire IA/knowledge/provenance, learning candidates et pricing intelligence validée.
- Durcissement production : MFA, contrôles d'abus, observabilité, rétention, staging,
  sauvegarde/restauration et architecture réseau locale/cloud revue.
