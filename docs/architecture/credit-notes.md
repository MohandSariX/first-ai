# Avoirs — M4

Fondation technique domestique, **conformité fiscale globale non établie**.
Un avoir diminue une facture émise ; il ne réécrit pas l’original et n’exécute
aucun remboursement. Factures de remplacement, majorations rectificatives,
corrections d’identité et cas fiscaux exceptionnels restent à cadrer séparément.

## Domaine et références

Migration additive `0017_bright_spyke.sql` : `credit_notes`, `credit_note_items`,
`credit_note_number_counters` privé ; enum `draft / issued / cancelled`.
Elle ajoute `invoices.amount_credited` et `customer_credit`, initialement zéro,
et remplace seulement la contrainte de solde. Aucun historique renuméroté ni
snapshot facture réécrit. Les migrations 0000–0016 restent inchangées.
`0018_panoramic_white_tiger.sql` ajoute le plafond explicite `amount_paid <= total`
pour conserver aussi en SQL l’interdiction du trop-perçu initial. Ce correctif
additif ne réécrit pas 0017 déjà appliquée.

Un avoir lie organisation, facture originale et auteur par FK composites.
Ses lignes lient avoir/facture/organisation. `original_line_index` désigne la
position stable dans **le snapshot immuable**, pas une ligne CRM live : les anciens
documents v1/v2/v3 ne stockent pas les UUID des items. Aucun lien inventé vers un
item historique ; absence/incohérence du document original bloque la correction.

Le brouillon porte une référence UI `BROUILLON-UUID`, aucun numéro AV. Motif,
type et facture sont fixés à la création ; annuler/recréer pour les changer.
Clé UUID unique par organisation pour création idempotente. Partiel : sélectionner
une ligne originale et un montant HT **positif** à déduire. Complet : toutes les
bases restantes. Pas de prix négatifs libres ni de quantité corrigée prétendue.
Au plus 200 lignes, inputs Zod bornés, NUMERIC(14,2)/BigInt centimes.

## TVA et sur-correction

Description, quantité originale, unité et taux proviennent du document original.
Pour chaque ligne, la TVA du nouvel avoir est :

`arrondi(originalTVA × HTcorrigéCumulé / originalHT) − TVAavoirsDéjàÉmis`.

Arrondi moitié supérieure au centime, calcul exact. Le dernier avoir consomme
exactement le reliquat de TVA arrondie de la ligne ; aucun excédent par accumulation
de petits arrondis. Les taux sont ventilés séparément. Les remises/frais M3 sont
déjà inclus dans les bases nettes originales, jamais recalculés depuis le catalogue.
Les bases cumulées ne peuvent dépasser celles du document initial.

## Émission et numérotation

Service → store transactionnel → repositories explicitement tenant-scopés.
À chaque accès, membership/organisation actifs et rôle courant sont relus ; pour
les mutations, share locks puis facture **FOR UPDATE avant l’avoir**. Même verrou
parent que PaymentService : paiements et corrections ne courent pas séparément.

Émission : relire l’original et les avoirs déjà émis, recalculer, vérifier les bases,
allouer `AV-YYYY-000001`, capturer le snapshot v1, figer lignes/avoir, synchroniser
le solde. Tout commit ensemble ; toute erreur rollback, compteur compris. Un
brouillon complet devenu périmé doit être annulé/recréé, pas corrigé silencieusement.
Retry d’émission déjà réussie retourne le même numéro/date/document après auth.

Compteur durable organisation/année, advisory lock propre à la série AV, heure
PostgreSQL lue après verrou et date civile du fuseau organisation. Ordre d’émission,
pas de création ; continuité par série annuelle ; changement d’année ouvre une
série distincte. Recul d’horloge/date refusé. Pas de `nextval`, antidatage ou numéro
navigateur ; capacité 999999 par année. L’allocateur n’est exécutable ni par les
clients authenticated/anon ni par service_role ; seul le serveur PostgreSQL prévu
l’appelle dans une transaction complète. Les counters ne révèlent aucune ligne
aux utilisateurs (RLS sans policy), et ne peuvent reculer/être supprimés tant que
l’organisation existe. Leur dernier UUID n’a pas de FK afin de garder le high-water
mark après cleanup fictif ou suppression privilégiée : aucun numéro réutilisé.

Triggers SQL : identité/référence/motif immuables ; transitions d’émission vérifient
allocation, snapshot original, bases cumulées et TVA ; lignes non éditables après
issue/cancel ; avoir émis/cancelled non modifiable. Aucune opération applicative de
suppression. Une administration privilégiée peut encore supprimer un document
entier (cascade nécessaire au cleanup local), contourner les services ou désactiver
des triggers : **M5 rétention/audit reste nécessaire**, ceci n’est pas un stockage WORM.

## Paiements et solde

`originalTTC − avoirsÉmisTTC − encaissementsComplétés = detteRestante − créditClient`.

Dette et crédit sont non négatifs et mutuellement exclusifs. Les lignes, totaux,
numéro/date et snapshot de la facture restent identiques. Les paiements existants
ne changent pas ; leur annulation de saisie conserve l’historique et recalcule le
solde avec les avoirs. Un nouvel encaissement ne peut dépasser la dette nette.
Un paiement antérieur de 100 sur facture 100 suivie d’un avoir 20 crée un crédit
client 20, **pas un remboursement de 20**. Crédit attaché à cette facture ; aucune
réallocation inter-factures ni intégration bancaire.

Avec encaissement positif et dette nulle, statut facture `paid` (solde éteint par
encaissement et/ou avoir) ; les montants affichent séparément reçu et corrigé.
Correction totale sans encaissement : dette zéro, statut `issued`, aucun faux paiement.
`paid_at` reste la date du dernier encaissement réel déclaré, jamais celle de l’avoir.

## Snapshot, PDF et UI

Snapshot avoir v1 : copie exacte du snapshot facture v1/v2/v3/v4, numéro/date AV,
metadata d’émission, motif/type, lignes corrigées, totaux et TVA par taux. Pas de
secrets, internal notes, chaîne de pensée ou données CRM relues pour le document.

PDFKit existant, serveur Node, à la demande, sans dépendance supplémentaire,
stockage objet, HTML, filesystem fourni par l’utilisateur ou IA. Titre **AVOIR**,
AV/date, FAC/date originale, identités, références M3 pertinentes, motif et montants
positifs « à déduire ». Avertissement de conformité non validée et absence de
remboursement. Limites WinAnsi, 200 pages/20 Mo ; Unicode reste M6.
Le PDF facture conserve son corps original ; seul son encart courant/daté présente
encaissements, avoirs, reste dû/crédit client et statut déclaratif non vérifié par banque.

Routes : `/credit-notes`, `/credit-notes/[id]`,
`GET /api/credit-notes/[id]/pdf`. Création depuis `/invoices/[id]`, édition HT,
confirmation explicite d’émission puis PDF. Listes paginées, formulaires/cartes
mobiles ; navigation secondaire pour ne pas encombrer la barre basse.

Permissions `creditNotes.read/write/issue` : OWNER/ADMIN/MANAGER/ACCOUNTANT complets,
READ_ONLY lecture, TECHNICIAN refusé. RLS lecture via facture accessible (donc
membership actif/rôle/tenant), lignes via parent ; aucune policy SQL write/anon.
Boundary serveur authentifié, contexte organisation dérivé du user courant,
service revalide permission/membership. Aucune action/outil IA avoir ; registres
Director/spécialistes/approvals inchangés.

## Validation et limites

Tests sans runtime : bases/TVA multi-taux/centimes, sur-correction, full restant,
solde/crédit, permissions/schémas/format AV, bytes/texte PDF déterministes.
Intégrations Supabase local : UUID étrangers, RLS/anon/service-role, role/membership
révoqué, FK, émissions concurrentes/ordre/rollback/retry, compteur annuel,
sur-correction concurrente, immutabilité SQL, paiements et original inchangés.
E2E local : facture émise → avoir partiel → AV → solde net → PDF, révocation de
rôle/membership, READ_ONLY et viewport 390 px. Fixtures fictives nettoyées : avoirs
avant paiements/factures, lignes par cascade du parent ; counters par organisation.

M5 : piste d’audit, original délivré, rétention/purge/restauration ; M6 : Unicode ;
M7 : plateforme/e-reporting. Aucun remboursement, envoi, agent Billing ou correction
fiscale automatique. Validation des scénarios par l’émetteur/conseil reste requise.

Références officielles de cadrage (consultées le 2026-10-06) :
[DILA — Tout savoir sur la facturation](https://entreprendre.service-public.gouv.fr/vosdroits/F23208),
[DGFiP — BOI-TVA-DECLA-30-20-20-20, factures rectificatives/avoirs](https://bofip.impots.gouv.fr/bofip/142-PGP.html/identifiant=BOI-TVA-DECLA-30-20-20-20-20220119).
La [spécification d’audit](../compliance/france-invoicing-audit.md) demeure le cadrage,
pas une certification de cette implémentation.
