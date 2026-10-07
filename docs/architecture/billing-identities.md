# M1 — Identités de facturation et classification

Fondation technique issue de l’[audit français](../compliance/france-invoicing-audit.md).
**Pas de certification fiscale ni d’autorisation d’usage fiscal production.**
[M2 numéro/date](invoice-numbering.md) étend ce snapshot en v3 ; [M3 mentions](invoice-mentions.md)
le porte désormais en v4 pour les nouvelles émissions ; M5–M7
restent distincts. Aucune intégration électronique ou mutation IA ajoutée.

## Modèle et migration

`0013_tiresome_komodo.sql` ajoute des colonnes aux trois tables existantes, sans
nouvelle table ni backfill. Les champs inconnus restent NULL, sans inférence depuis
le secteur CRM, le site, le nom, un identifiant TVA ou le rôle de l’utilisateur.

- `organizations` réutilise legal_name, l’adresse légale/siège existante, country,
  siret et vat_number. Ajouts : legal_entity_type (company / individual_entrepreneur /
  association / public), legal_form, siren, registration, share_capital NUMERIC,
  vat_regime (normal / franchise / exempt), vat_on_debits nullable et company_size.
  La taille est déclarative, facultative, sans calcul d’échéance ni preuve de statut.
- `customers` : billing_classification (professional / individual / public),
  billing_name/legal_name, billing_address_line1/line2/postal_code/city/country,
  establishment_country, taxable_person nullable et siren. SIRET/TVA existants sont
  les identifiants de cette même entité client. Le nom légal CRM reste distinct du
  nom légal de facturation. Pas de copie automatique du nom CRM ou d’un site.
- `invoices` : transaction_type (B2B / B2C / B2G), operation_category
  (services / goods / mixed), fiscal_territory (domestic / eu / international),
  vat_treatment (normal / franchise / exemption / reverse_charge / other), vat_reason.
  Le brouillon peut rester incomplet ; l’émission exige une qualification complète.

CHECKs : format SIREN, cohérence SIREN/SIRET lorsqu’ils sont présents, capital
non négatif, taille déclarée et formats de pays client. Enums SQL pour les
classifications stables. Aucune vérification de registre/SIRENE/VIES ou de clé TVA
effectuée : formats/cohérence syntaxiques ne certifient pas un identifiant réel.
Pas de nouvel index sans besoin de recherche ; tenant/FK/RLS existants conservés.

## Configuration, permissions et accès

`BillingIdentityService` → `InvoiceSession` tenant-scopée → DB. Chaque lecture et
écriture relit/verrouille membership/organisation actifs et rôle courant. Inputs
Zod stricts, profils remplacés explicitement, aucun organizationId client accepté.

- `/settings/billing` : rôles invoices.read consultent ; seuls OWNER/ADMIN possèdent
  `billing.seller.write`. MANAGER n’obtient pas ce droit via son ancienne liste globale.
- Fiche `/customers/[id]` : section de facturation séparée des contacts/sites,
  visible aux rôles invoices.read. OWNER/ADMIN/MANAGER/ACCOUNTANT ont
  `billing.customer.write` ; READ_ONLY consulte, TECHNICIAN ne reçoit pas ces contrôles.
- `/invoices/[id]` : formulaire explicite de classification pour un brouillon,
  permission invoices.write et membership frais. Issued/cancelled ne sont pas éditables.
  Configuration liée depuis la facture/navigation secondaire, sans nouvelle nav primaire.

RLS des rows organizations/customers reste tenant-scopée ; ces identités ne sont
pas des secrets et aucune restriction SQL par colonne n’est ajoutée. Aucun nouveau
droit SQL d’écriture authenticated. Les services restent indispensables sur la
connexion Drizzle privilégiée. Identités des autres tenants : not found ; jamais
révélation de leur existence. Aucun outil ni action d’approbation IA de facturation.

## Validation à l’émission : enveloppe supportée

Sous la transaction existante : membership/rôle actifs, facture verrouillée,
sources revalidées, identités sous verrous partagés, totaux BigInt recalculés,
validation du scénario, snapshot v4 depuis M3 + issued_at/statut/totaux atomiques.
Toute erreur rollback ; retry d’une émission conserve le document original.

- Vendeur : identité légale, type juridique, adresse complète, pays, régime TVA,
  option débits oui/non explicite ; SIREN français. Société : forme, capital et
  immatriculation applicable (texte registre/lieu). EI : capital/forme non exigés.
  TVA normale : identifiant vendeur requis ; franchise/exempt : pas de TVA inventée.
- Client : classification, nom facturé, adresse dédiée complète, pays de facturation
  et d’établissement, qualité d’assujetti oui/non explicite. Professionnel/public :
  identité légale et SIREN français. Particulier : non-assujetti, sans SIREN imposé.
  Pour simplicité M1 exige aussi son adresse ; opposition/adaptations B2C différées.
- Transaction choisie cohérente avec classification : professional → B2B,
  individual → B2C, public → B2G. Ce contrôle ne transforme pas « professionnel »
  en « assujetti » ; taxable_person reste indépendant, aucun canal électronique déduit.
- Émission limitée aux parties/adresse françaises et territoire domestic.
  EU/international peuvent être préparés mais sont bloqués jusqu’à cadrage dédié.
- Franchise vendeur ↔ traitement franchise ; vendeur exempt → exemption.
  Normal facture des taux positifs explicites, sans choix automatique de taux.
  Franchise/exonération/autoliquidation n’autorisent que des taux nuls.
  Exonération/autoliquidation demandent un motif validé ; reverse_charge demande
  B2B assujetti, régime normal vendeur et numéro TVA client. Les identifiants FR
  présents doivent avoir le format FR et correspondre au SIREN déclaré.
- `other` bloque l’émission. Traitements fiscaux différents selon les lignes,
  TVA normale à taux nul et cas spéciaux nécessitent une extension explicitement cadrée.
  Les qualifications/motifs sont saisis par l’humain, pas validés juridiquement par un LLM.

Ces contrôles représentent un périmètre conservateur, pas toutes les exceptions
légales (facture simplifiée, régime particulier, activité artisanale, territorialité).
Le conseil fiscal et M0 restent nécessaires ; les tests ne certifient pas la conformité.

## Snapshot et PDF

Union Zod discriminée : version 1 historique inchangée, version 2 livrée M1,
version 4 pour les nouvelles émissions depuis M3 (v3 M2 conservé). V2 conserve les champs de rendu précédents et ajoute
seller.fiscalIdentity, customer.billingIdentity et classification. Données prises
dans la même transaction ; ni notes internes, secrets ni chaîne de pensée.

Le trigger remplacé dans la **nouvelle** migration conserve la protection
commerciale, exigeait v2 en M1 (v3 M2, v4 depuis M3) et sa cohérence avec les colonnes
classifiées. Classification et snapshot sont gelés après émission, y compris
interdiction de qualifier silencieusement les anciennes factures. Aucune réécriture
des anciennes migrations ou snapshots ; legacy NULL reste indisponible en PDF.

PDF à la demande : adresse facturation dédiée, identité légale, EI/forme/capital/
immatriculation/SIREN présents et classification lisible. M1 n’ajoutait pas les
mentions/dates M3 ; celles-ci sont désormais rendues conditionnellement en v4,
sans changer les documents historiques.
Avertissement fiscal maintenu. V1 garde son avertissement d’adresse absente.
Paiements déclaratifs actuels restent séparés du corps immuable ; WinAnsi inchangé.

## Tests et suite

Unitaires : profils/choix explicites, B2B/B2C/B2G, catégories, EI/société,
normal/franchise/exonération/autoliquidation, motifs/données manquantes,
permissions et conversion des formulaires sans booléen inconnu coercé en false.
PDF v1/v2 : bytes réels, identités/classification, totaux, compatibilité et rendu visuel.
Intégrations locales : scope/RLS UUID connu, anonymous/inactive/role révoqué,
rollback, profils modifiés après issue, classification SQL immuable et franchise.
E2E mobile : configuration vendeur/client, séparation site, rejet sans qualification,
émission puis PDF ; anciennes attentes de navigation synchronisées sur route détail.

M2 numérotation/date, M3 dates métier/mentions et [M4 avoirs](credit-notes.md) sont livrés
séparément ; M5 rétention/audit, M6 Unicode et M7 plateforme restent non implémentés. Réception électronique déjà
applicable à qualifier sans attendre ces jalons. Aucun email, paiement bancaire ou IA write.
