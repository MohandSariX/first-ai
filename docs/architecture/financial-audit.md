# M5A — Audit financier et immutabilité

Fondation technique, **conformité fiscale globale non établie**. Le cadrage reste
l’[audit français](../compliance/france-invoicing-audit.md). [M5B](financial-retention.md)
complète la conservation des originaux, politique et export/vérification locaux.
Sauvegarde production, WORM/PDF-A et workflow de purge ne sont pas des garanties
fournies par ce journal PostgreSQL ni par ce socle local.

## Modèle et couverture

`financial_audit_events` est tenant-scopé, append-only : UUID, ressource/type,
événement explicite, acteur humain, correlation UUID transactionnelle, métadonnées
JSONB bornées à 2 Ko, instant serveur UTC. FK composite acteur/organisation et
validation SQL de l’appartenance de la ressource. Index organisation/date/UUID
pour consultation paginée. Aucun journal synthétique historique : **couverture
à partir du déploiement M5A**, pas des actions antérieures.

| Événement | Déclenchement |
| --- | --- |
| invoice.issued | Première émission réussie |
| invoice.cancelled | Annulation autorisée d’un brouillon |
| invoice.status_changed | Transition réelle du solde dérivé |
| invoice.metadata_changed | Note interne administrative effectivement modifiée |
| credit_note.issued / credit_note.cancelled | Émission ou annulation de brouillon |
| payment.recorded / payment.cancelled | Encaissement manuel ou annulation explicite de saisie |
| billing.seller_changed / billing.customer_changed / billing.terms_changed | Configuration via le service de facturation |
| invoice.artifact_persisted / credit_note.artifact_persisted | Original préservé dans la transaction d’émission M5B |
| billing.retention_changed / billing.archive_exported / billing.archive_verified | Politique, export et résultat de vérification M5B |

Pas de lectures, de chaîne de pensée, de secrets, de copies de profils/adresses,
de snapshots complets ou de raisons textuelles dans le journal. Les montants,
numéros, états et liens pertinents sont autorisés ; les configurations enregistrent
les noms de champs, pas leurs valeurs. Le motif de correction reste sur le paiement.
La création/modification courante des brouillons et chaque changement de solde
sans changement de statut ne produisent pas d’événement supplémentaire : le
paiement/avoir source est journalisé. Les changements de configuration hors
service (maintenance SQL) ne sont pas couverts par ces événements applicatifs.

Les opérations financières actuelles sont humaines : `actor_type = user` et
acteur non nullable. Aucun faux acteur système/agent. Une future opération système
nécessitera une extension explicite du contrat ; les registres IA financiers
n’ont reçu aucun write. L’approbation IA Risk 1+ reste inchangée.

## Acteur de confiance et atomicité

Session serveur → membership/organisation actifs verrouillés → rôle revalidé.
`InvoiceSession`/`PaymentSession` installent ensuite l’acteur, l’identité Auth,
l’organisation et une corrélation avec `set_config(..., true)` dans la transaction.
Ces variables locales disparaissent au commit/rollback, sans fuite via le pool.
Ni formulaire, ni URL, ni LLM ne fournit l’autorité organisationnelle/acteur.

Les triggers de facture/avoir/paiement insèrent les événements dans la transaction
de la mutation. L’INSERT du journal revérifie membership actif, identité Auth,
organisation/rôle et corrélation ; les services restent la première autorisation.
Les événements de configuration sont écrits par le repository dans la transaction
du même service. Échec de mutation **ou d’audit** : rollback de l’ensemble, numéro
fiscal inclus. Un retry idempotent ne répète pas la mutation ni son événement.
Pas d’événement de succès pour une transaction échouée ; erreurs dans les logs
applicatifs, sans nouveau système persistant d’échecs.

## Protections PostgreSQL

- Facture émise, y compris legacy sans snapshot : tous les champs commerciaux,
  identités/sources, numéro/dates, classification, totaux, contenu/snapshot,
  auteurs/création et deleted_at sont figés. Aucune réécriture de l’historique.
- Les seuls champs dynamiques sont statut, montants reçus/corrigés/reste/crédit,
  paid_at et updated_at. Une modification des données financières doit correspondre
  aux agrégats réels des payments completed et credit_notes issued ; pas de paid,
  retour draft, annulation fiscale ou written_off arbitraire. Les transitions
  manuelles non implémentées (sent/overdue/written_off) restent non disponibles.
- `internal_notes` est administratif, jamais inclus dans le document : modification
  via `updateAdministrativeMetadata`, permission `invoices.metadata.write`
  OWNER/ADMIN, contexte frais et événement ne contenant que le nom du champ.
  Aucun changement de contenu fiscal autorisé par cette exception ; pas d’outil IA.
- Lignes de facture : INSERT/UPDATE/DELETE refusés après émission. Verrou parent
  FOR UPDATE partagé avec émission/édition ; identité/reparenting immuables.
  Les lignes d’avoir déjà protégées M4 restent figées après émission/annulation.
- DELETE des factures/avoirs émis, de tous paiements et événements refusé, même
  sur la connexion PostgreSQL privilégiée ordinaire. Suppression tenant/cascade
  ne contourne pas les parents ; TRUNCATE interdit sur ces tables et leurs lignes.
- Paiement : données originales immuables, seul completed → cancelled avec
  auteur courant/date/motif autorisé ; réactivation et suppression refusées.
- Triggers différés vérifient au commit que paiement/avoir et balance sont
  synchronisés dans la même transaction. Un INSERT privilégié sans mise à jour
  du solde est rejeté ; rien n’est réécrit implicitement par le trigger.

Les fonctions invoker ont un search_path vide et aucune exécution RPC accordée
à PUBLIC/anon/authenticated/service_role. Aucun bypass runtime, flag applicatif,
endpoint de purge ou fonction SQL de désactivation des protections.

## Permissions, consultation et frontière administrative

`financialAudit.read` : OWNER/ADMIN/MANAGER/ACCOUNTANT. TECHNICIAN et READ_ONLY
refusés, choix de moindre privilège distinct de invoices.read. RLS exige tenant
actif et ces rôles ; anonymes refusés. Aucun INSERT/UPDATE/DELETE/TRUNCATE accordé
aux utilisateurs ni au service-role sur le journal. Les repositories serveur
privilégiés restent explicitement scopés ; le service relit le rôle/membership.

`/settings/audit` affiche 20 événements/page : date dans le fuseau organisation,
acteur UUID abrégé, événement français, numéro/montant/champs configurés et liens
tenant-scopés de facture/avoir. Aucune édition/suppression ni JSON brut. Les liens
passent aussi par les permissions des pages cibles ; ressources brouillons
supprimées peuvent rester not found sans révéler un autre tenant.

**Limite de confiance :** propriétaire/superuser PostgreSQL et opérateur de
migration peuvent techniquement désactiver les triggers, modifier les privilèges
ou forger le contexte serveur. Les variables transactionnelles ne constituent
pas une preuve cryptographique d’identité contre ce propriétaire. M5A protège
les writes runtime ordinaires, pas une administration malveillante, ni WORM.
M5B ajoute une fondation locale ; privilèges/stockage durables et restauration
réelle de production restent à valider séparément.

## Migrations et vérifications

`0019_stale_manta.sql` : table/RLS/index/FK/checks, acteur, audit transactionnel,
guards facture/items/paiement/suppression. `0020_financial_audit_integrity.sql` :
validation de ressource tenant et contrôles différés ledger/solde ajoutés après
revue de 0019 déjà appliquée. Deux migrations additives ; 0000–0018 inchangées.
Générées avec Drizzle, inspectées et appliquées **localement seulement**, second
passage sûr via tracking. Aucun backfill ni modification de snapshot/template PDF.

Tests : refus SQL des numéros/dates/snapshots/totaux/lignes/suppression/masquage,
événements et acteurs/corrélation, idempotence, rollback réel après création des
événements, mutations sans contexte, ledger non synchronisé, métadonnées autorisées,
RLS/UUID exact/anon/membership/rôles, pagination et input strict. E2E étend le flux
facture → avoir → audit mobile, puis refus READ_ONLY. Pas de provider IA.

Cleanup : uniquement dans les fichiers de tests, URLs DB/Supabase locales et UUID
de tenant fictif possédé + nom attendu vérifiés. Une transaction propriétaire de
test utilise SET LOCAL session_replication_role = replica pour effacer explicitement
les seules tables financières du tenant fixture, puis rétablit automatiquement
les triggers. Aucun mécanisme installé dans le schéma ou exposé au runtime.
Les fixtures ne prouvent ni n’autorisent une purge des documents réels.

Fondation M5B livrée ; sauvegarde production, M6 (Unicode), M7 (transport électronique) et
qualification M0 restent ouverts. Ce journal ne certifie ni la piste d’audit fiscale
complète ni un logiciel de caisse ; les paiements restent déclaratifs/non bancaires.
