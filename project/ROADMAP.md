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
- Audit fiscal/facturation français au 2026-10-05 : sources officielles, inspection
  code/PDF, matrice d’écarts et spécification par petits jalons.
  **Audit terminé ; corrections en attente, conformité non établie.**
- M1 identités/adresses de facturation vendeur/client, classification explicite,
  qualification TVA, UI de configuration, snapshot v2 des nouvelles émissions.
  Historique préservé ; périmètre technique domestique FR, sans certification fiscale.
- M2 référence brouillon distincte, compteur fiscal durable à l’émission, date serveur
  avec fuseau/année et snapshot v3 ; concurrence/rollback/retry testés, legacy préservé.
- M3 dates métier confirmées, commande/livraison, unités/remises/frais exacts,
  termes/TVA conditionnels configurés et snapshot/PDF v4 ; périmètre domestique ordinaire.
- M4 avoirs partiels/complets liés au document original immuable, TVA cumulative
  exacte, série AV à l’émission, soldes/crédit client sans remboursement, RLS et UI/PDF.

## CURRENT

M4 livré techniquement ; aucun jalon
en cours. Conformité non établie.
Spécialistes toujours supervisés et Director read-only. Aucun mouvement bancaire,
envoi, rapprochement ou élargissement du registre IA dans ce jalon.

## NEXT

- Suivre la [spécification fiscale](../docs/compliance/france-invoicing-audit.md),
  sans regrouper toutes les corrections dans un seul chantier :
  1. M0 : qualifier émetteur/TVA/clientèle/flux et sécurisation encaissement B2C ;
     organiser la réception via plateforme si déjà requise, sans attendre le PDF.
  2. M1 livré : ne pas déduire la validation fiscale de la présence des nouveaux champs.
  3. M2 livré : qualifier séries/émetteurs legacy avant production ; aucune réparation historique implicite.
  4. M3 livré : exceptions, acomptes et qualification des clauses restent à cadrer.
  5. M4 livré : avoirs réductifs ; remplacement/majoration et cas fiscaux exceptionnels à cadrer.
  6. M5/M6 : audit/rétention/original conservé, puis PDF Unicode (avançable si nécessaire).
  7. M7 : intégration plateforme/e-reporting dédiée, à prioriser séparément si
     émission/reporting déjà exigibles ; un PDF ordinaire n’est pas ce flux.
- Cadrer facturation partielle/source sans présumer une seule facture par quote/job.
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
