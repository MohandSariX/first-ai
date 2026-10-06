# M2 — Référence brouillon, numéro fiscal et date d’émission

Fondation technique issue de l’[audit français](../compliance/france-invoicing-audit.md),
pas une certification fiscale. M3–M7 et la qualification des flux M0 restent ouverts.
La règle de séquence au fil de l’émission et de date est vérifiée dans le
[BOFiP, §§70–140](https://bofip.impots.gouv.fr/bofip/140-PGP.html/identifiant=BOI-TVA-DECLA-30-20-20-10-20131018).
L’organisation représente un émetteur dans ce modèle ; import, multi-émetteurs et
justification fiscale des séries doivent être validés avant production.

## Références et dates

- Création : `BROUILLON-<UUID>` interne stable/unique par organisation. L’UUID est
  généré au serveur, pas une séquence fiscale. `invoice_number`, `issue_date`,
  `issued_at` restent NULL. Abandon/annulation/soft-delete ne consomment aucun FAC.
- Émission : `FAC-YYYY-NNNNNN`, série annuelle explicite par organisation, capacité
  999 999. Une nouvelle année démarre à 1, sans effacer les séries précédentes.
- `issued_at` est l’instant UTC du serveur PostgreSQL ; `issue_date` sa date civile
  dans `organizations.timezone`. Année et fuseau sont capturés dans le document.
  Horloge lue après l’attente du verrou, tronquée à la milliseconde pour les DTO JS.
- `created_at` reste la métadonnée de création du brouillon. Pas de date fiscale
  prévue dans un formulaire. Les inputs `issueDate`/`issuedAt` sont refusés.
  Antidatage contrôlé, date manuelle/future, période/prestation/acompte sont différés.
- L’échéance saisie doit être au moins la date réelle à l’émission. Une échéance
  dépassée bloque l’émission sans allocation définitive ; créer un brouillon valide.

## Transaction et concurrence

`InvoiceService.issueInvoice` revalide membership actif/rôle, verrouille facture et
sources, gèle les profils M1 sous verrous partagés, puis appelle l’allocateur privé
via `InvoiceRepository.allocateFiscalNumber`. La même transaction valide le scénario,
recalcule les totaux BigInt, écrit snapshot v3 + numéro/date/statut et commit.

`public.allocate_invoice_number(org, invoice)` est SQL invoker, search_path vide,
exécution PUBLIC/anon/authenticated/service_role révoquée. La connexion serveur
PostgreSQL possède le privilège nécessaire ; aucune RPC publique ni outil IA.
Le helper n’authentifie pas l’utilisateur : les permissions du service restent obligatoires.

Un advisory lock transactionnel au namespace `invoice-fiscal:<tenant>` sérialise
toutes les émissions d’un tenant, y compris une frontière annuelle. Collisions
de hash peuvent seulement sérialiser deux tenants, pas mélanger leurs données.
Il évite d’upgrader le verrou organisation partagé du membership, source possible
de deadlocks. Puis l’UPSERT verrouille le compteur `(organization_id, fiscal_year)`.

`invoice_number_counters` conserve last_number/last_issued_at/last_issue_date et
l’ID de la dernière allocation ; aucun accès client, RLS sans policy. Pas de
`nextval`, ni recherche MAX à chaque émission. Incrément, snapshot et facture
sont dans une transaction : échec de validation/persistence → rollback du compteur.
L’allocateur ne doit jamais être appelé dans une transaction serveur qui commit
sans émettre la facture ; son unique appel applicatif est encapsulé dans ce service.

Le lock est conservé jusqu’au commit : deux brouillons émis dans l’ordre inverse
de leur création reçoivent les numéros dans l’ordre des émissions. Retry de la
même facture déjà émise retourne numéro, date et snapshot originaux, même après
paiement. Pas de nouvelle allocation ou recapture de profils.

Un recul d’horloge/date/fuseau/année par rapport aux high-water marks conservés
bloque l’émission : réconciliation explicite, jamais antidatage ni remise à zéro.

## Contraintes et limites administratives

- UNIQUE organisation/numéro et organisation/référence interne.
- CHECK : brouillon sans numéro/date/instant ; état émis avec numéro/date/instant.
- Trigger INSERT : nouveau record uniquement non émis. Import historique différé.
- Trigger UPDATE : numéro/date/instant/tenant émis immuables, même legacy sans snapshot ;
  référence interne immuable. Nouvelle émission liée à la dernière allocation de
  cette facture et à un snapshot v3 cohérent. Protections M1 commerciales conservées.
- Compteur UPDATE avance de 1, jamais recule ; DELETE refusé tant que le tenant existe.
  L’ID de dernière allocation n’a volontairement pas de FK : effacer une fixture
  facture ne libère pas un numéro. Cleanup intégration supprime le tenant fictif,
  puis ses compteurs par cascade ; ce n’est pas une politique de rétention production.

Ces protections ne constituent pas une piste d’audit/archivage fiscal. Une
administration propriétaire peut encore contourner des guards, incrémenter un
compteur hors service, supprimer un tenant ou désactiver des triggers. M5 doit
cadrer privilèges, conservation et mutations administratives. Aucun endpoint de
suppression de facture émise n’est ajouté.

## Migration et legacy

`0014_strange_enchantress.sql` ajoute la référence interne et les compteurs, rend
numéro/date nullable et ajoute les guards. Les anciens FAC émis sont conservés,
avec leurs dates/snapshots v1/v2/NULL ; compteur initial = maximum FAC émis par série.
Les trous/ordre historiques restent historiques : aucune continuité rétroactive
prétendue. Les numéros non FAC sont conservés mais ne déterminent pas la série FAC.
Les anciennes dates futures/incohérences peuvent bloquer une nouvelle émission ;
aucune correction automatique. Les anciens brouillons/annulations non émis
perdent leur réservation FAC/date prévue, reçoivent une référence interne par ID.

`0015_fix_invoice_allocator_conflict.sql` corrige uniquement la cible ON CONFLICT
par son nom de contrainte (ambiguïté avec le paramètre de sortie fiscal_year).
0014 avait déjà été appliquée localement : elle n’a pas été réécrite. Les tentatives
en échec ont rollback sans consommer de numéro. Aucune ancienne migration modifiée.

## Snapshot, PDF et UI

V3 étend V2 avec `issuance: { issuedAt, timeZone, fiscalYear }`. Numéro définitif,
date et identités sont capturés atomiquement. Schéma Zod vérifie date/année/fuseau
et cohérence de capture ; v1/v2 inchangés et toujours lisibles. Aucun backfill.
PDFKit affiche le numéro/date du snapshot uniquement, jamais la référence interne.
Pas de PDF brouillon ; pas de changements de police/mentions M3/paiements/IA.

Liste/détail affichent « Référence brouillon » ou « Numéro de facture », formulaire
sans date d’émission manuelle. Confirmation explicite du numéro définitif/date et
du gel du document. Recherche sur les deux références, toujours tenant-scopée.

## Validation

Unitaires : formats/capacité, rejet dates/numéros client, frontière année/fuseau,
validation metadata v3, PDF réel avec date civile différente du jour UTC, legacy v1/v2.
Intégrations locales : inverse création/émission, concurrence, abandon, retry,
rollback snapshot/persistence/échéance, high-water mark durable après suppression
fictive, série annuelle distincte, SQL immutabilité, RPC/compteurs privés,
tenant/UUID/anonymous/membership/roles. E2E : brouillon sans FAC → émission →
PDF avec le même FAC, plus les scénarios existants CRM/opérations/paiements.

La frontière d’année réelle est testée par le calendrier déterministe et par une
série antérieure en DB ; aucun changement d’horloge machine ni faux timestamp
injecté dans l’allocateur production. Aucun appel OpenAI/Ollama.
