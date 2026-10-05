# Invoice Document / PDF Foundation

Fondation technique, **pas une validation fiscale ni une autorisation d’usage
production**. Aucun email, PDF distant, stockage objet, réseau de facturation,
avoir ou opération bancaire introduit.

La version 1 décrite ci-dessous est historique. Les nouvelles émissions utilisent
désormais le [snapshot v2 et les identités/classifications M1](billing-identities.md).
Les profils vendeur/client ont leurs champs structurés et UI dédiées ; l’adresse
client n’est plus absente sur les nouvelles factures correctement configurées.
Les anciens snapshots restent inchangés. Les limites M2–M7 restent applicables.

## Document commercial immuable

`invoices.document_snapshot` est un JSONB versionné/validé Zod, scoped par la
facture et sa RLS existante. La migration additive `0012_flawless_havok.sql`
n’ajoute ni table ni policy ; elle ajoute la colonne et un trigger d’immutabilité.

`InvoiceService.issueInvoice` revalide sous verrous le membership/organisation
actifs et le rôle courant, verrouille la facture, vérifie les sources, calcule
les lignes/totaux BigInt et capture les identités vendeur/client sous verrous
partagés. Snapshot, totaux, statut issued et issued_at sont écrits atomiquement.
Toute erreur annule l’émission. Le retry conserve le snapshot original, même
après encaissement, sans recapturer les identités modifiées.

Version 1 : IDs invoice/organisation, date de capture, EUR, vendeur et client,
numéro/dates/statut à l’émission/notes client, lignes/quantités/prix HT/TVA et
totaux par ligne, totaux globaux et bases/TVA par taux. Ni notes internes,
paiements, secrets ni chaîne de pensée dans ce snapshot.

Le trigger `public.protect_invoice_document()` (invoker, search_path vide,
exécution PUBLIC révoquée) refuse le remplacement/suppression d’un snapshot
et la modification des données commerciales correspondantes. Il impose un
snapshot cohérent sur les nouvelles transitions draft → issued. Les services
refusent toute mutation de ligne après émission ; authenticated n’a aucune
policy d’écriture directe. Les administrateurs privilégiés ne doivent pas
éditer les lignes hors services. Suppression administrative et audit/rétention
renforcée restent à cadrer : ce n’est pas un archivage fiscal WORM.

Les anciennes factures émises gardent NULL. Aucun backfill depuis le CRM actuel :
il fabriquerait un historique. Leur PDF est indisponible ; une future correction
explicitement validée devra traiter ce cas, pas une mise à jour silencieuse.

## Identités et configuration

- Vendeur : champs **existants** organizations.name/legalName, adresse, pays,
  SIRET, TVA, email/téléphone. Pas de nouvelle table settings. Nom/adresse/code
  postal/ville/pays requis avant émission, erreur française sinon. Identifiants
  inconnus restent null. Configuration par administration contrôlée du profil
  organisation ; aucun nouvel écran de profil vendeur dans ce jalon.
- Client : name/legalName/SIRET/TVA/billingEmail/phone réellement présents.
  **Aucune adresse de facturation dédiée n’existe dans le CRM.** L’adresse du
  snapshot reste explicitement null. Le PDF l’indique et porte un avertissement
  de conformité non validée. Le site n’est jamais une adresse de facturation
  implicite. Modèle/UI d’adresse client à compléter au cadrage fiscal.

Les modifications de profils après émission n’altèrent pas les snapshots.

## PDF et encaissements

`@first-ai/tools/invoice-pdf` utilise PDFKit 0.20.2 et les polices locales Helvetica.
Entrée Node séparée du registre d’outils ; PDFKit externalisé par Next pour ses
métriques locales. Aucun chemin filesystem fourni par utilisateur, HTML, réseau
ou IA. Génération à la demande sans bytes PostgreSQL, Storage ni cache.
Metadata de création = capture du snapshot ; dernière modification de l’encart
paiement = invoice.updatedAt. Mêmes données → mêmes bytes.

HT/TVA/TTC et ventilation par taux viennent du snapshot, avec arrondis au centime
par ligne identiques à la facture. Format EUR par chaînes, sans arithmétique
monétaire flottante. 1–200 lignes, textes/pages/bytes bornés, descriptions/notes
paginées sans troncature. WinAnsi couvre le français ; les caractères non pris
en charge provoquent un refus explicite plutôt qu’un nom corrompu. Polices
Unicode embarquées différées.

L’encart « Situation des encaissements — actualisée » est **dynamique** : statut,
montant enregistré et reste dû du même row facture cohérent, dérivés par
PaymentService. Paiement/correction change cet encart, jamais les montants,
lignes ou identités émis. Saisies manuelles déclaratives **sans vérification
bancaire**. Deux copies téléchargées peuvent donc différer après un paiement,
sans constituer deux versions du corps commercial.

## Accès et validation

`GET /api/invoices/[id]/pdf` : session fraîche → membership actif → permission
invoices.read courante → lookup tenant-scopé → snapshot validé → PDF Node.
Membership/rôle relus sous verrous dans le service de téléchargement également.
401 sans session active, 403 TECHNICIAN, 404 UUID étranger, 409 brouillon/document
historique/configuration manquante. READ_ONLY autorisé. Aucun lien public.
Réponse application/pdf, attachment FAC-YYYY-NNNNNN.pdf, private/no-store, nosniff.

`/invoices/[id]` propose « Télécharger le PDF » seulement si disponible.
Aucun PDF brouillon présenté comme facture émise. Agents/approvals inchangés.

Tests unitaires : signature/texte réel/numéro/identités/totaux/TVA multi-taux,
partiel/payé, déterminisme, pagination, configuration et glyphes. Intégrations
locales : capture, profiles modifiés, refus édition, immutabilité SQL, rollback,
legacy, UUID tenant et révocation rôle/membership. E2E : téléchargement réel,
draft/anonymous/inactive/TECHNICIAN refusés, READ_ONLY autorisé, UUID d’une autre
organisation refusé. Fixtures fictives nettoyées ; vérification visuelle séparée.

## FISCAL / INVOICE COMPLIANCE — différé

Ce prochain cadrage doit valider les champs légalement obligatoires (dont
adresse client), numérotation/chronologie, annulation/avoirs, TVA/mentions légales,
rétention, facturation électronique française, immutabilité/audit production.
Ce PDF technique ne prétend pas satisfaire ces exigences.
