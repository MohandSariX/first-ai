# M3 — Dates métier et mentions conditionnelles

Fondation technique domestique française, **conformité fiscale globale non établie**.
La spécification reste l’[audit](../compliance/france-invoicing-audit.md).
M0 exige toujours une qualification métier/fiscale de l’émetteur et des flux.

## Modèle et saisie explicite

Migration additive `0016_striped_vivisector.sql`, sans table nouvelle :
`organizations.invoice_terms` et `invoices.business_details` JSONB structurés/Zod ;
`invoice_items.unit`, `kind`, `discount_amount` avec contraintes positives.
Les colonnes historiques et snapshots v1/v2/v3 ne sont pas réécrits.

- Une date réelle d’exécution/livraison **ou** une période de service complète,
  terminée au plus tard à l’émission. Aucun timestamp job, site ou paiement déduit.
  Biens/mixte : date de livraison confirmée ; B2C services : lieu confirmé.
- Déclaration explicite de l’existence d’un bon de commande ; référence obligatoire
  si établi par l’acheteur. Pour biens/mixte, confirmer livraison identique à la
  facturation ou saisir son adresse FR distincte ; jamais copier implicitement un site.
- Unité textuelle bornée à 24 caractères, fournie/confirmée sur chaque ligne.
  Les anciennes lignes sans unité empêchent une nouvelle émission tant qu’incomplètes.
- Remise acquise HT en euros **sur toute la ligne**, pas par unité ni pourcentage.
  Elle ne peut dépasser le brut HT arrondi. Frais : ligne positive `kind = charge`,
  quantité 1, désignation/unité/prix et taux TVA explicites. Pas de ligne négative,
  remise globale implicite, escompte calculé, acompte ou avoir.

## Calcul et émission

BigInt exclusivement : quantité × prix arrondi au centime, puis remise HT,
TVA sur le net avec arrondi demi-supérieur par ligne, somme HT/TVA/TTC.
Les frais entrent dans les mêmes bases, avec leur propre taux. Maximum 200 lignes.
Le PDF utilise ces lignes/bases figées, jamais un calcul LLM ou flottant.

Le service verrouille/revalide membership actif, rôle, tenant et facture. Allocation
M2, calculs, identités M1, validation M3, snapshot v4 et statut émis sont atomiques.
Échec de configuration/date/unité : rollback, aucun numéro fiscal consommé.
Retry d’émission conserve numéro/date/document. Triggers conservent les protections
M2 et figent aussi `business_details` ; checks SQL protègent remises/frais.
Les guards runtime et l’audit financier sont complétés par [M5A](financial-audit.md) ;
la défense contre administration propriétaire et rétention demeurent M5B.

## Règlement et TVA

Configuration vendeur dans `/settings/billing`, permission `billing.seller.write`
OWNER/ADMIN et contexte frais. Pas de nouvelle permission/RLS ni secret.
Règle d’échéance : date explicitement convenue ou jours depuis émission/exécution.
Les règles en jours doivent correspondre à l’échéance du brouillon. B2B ordinaire
limité à 60 jours depuis émission ; 45 jours fin de mois et exceptions sectorielles
ne sont pas implémentés. Aucun choix automatique depuis les anciens paymentTermsDays.

| Scénario | Mentions figées |
| --- | --- |
| B2B | Règlement, escompte convenu ou « néant », pénalités BCE applicable + 10 points ou multiple du taux légal >= 3, indemnité forfaitaire 40 EUR |
| B2C | Règlement commun seulement ; aucune pénalité professionnelle/escompte B2B/indemnité 40 EUR copiée |
| B2G | Règlement commun et conditions publiques explicitement configurées ; aucune règle privée B2B automatique |
| Franchise | Mention vendeur explicitement configurée, TVA nulle selon M1 |
| Exonération/autoliquidation | Motif/base validée dans la classification M1, avec préfixe déterministe ; cas spécifiques restent à qualifier |
| TVA normale | Taux multiples exacts, sans inventer de motif depuis un taux zéro |

Aucun taux d’intérêt daté hardcodé, aucune génération de texte juridique par IA.
La configuration et les mentions ne certifient pas la légalité d’un cas particulier.
SIREN client/catégorie M1 restent rendus, option TVA sur débits rendue si vraie,
adresse de livraison différente rendue pour biens/mixte.

## Document et UI

V4 ajoute dates/référence, unité/brut/remise/type par ligne, raison TVA et conditions
de règlement effectivement applicables. V1/v2/v3 restent lisibles sans backfill.
Le profil vendeur/client modifiable ultérieurement n’altère aucun snapshot émis.
PDFKit, polices Unicode locales depuis [M6](pdf-unicode.md) ; encart paiement actuel déclaratif
distinct du corps immuable. Warning fiscal conservé. Ni IA ni transport électronique.
Formulaire vendeur séparé des identités ; bloc dates/commande dans le brouillon,
champs de livraison/lieu affichés selon classification ; champs ligne unité/remise/frais.

## Vérifications et limites

Unitaires : scénarios B2B/B2C/B2G, période/livraison/commande, franchise/exonération,
termes incomplets, calculs/remises/TVA multiple, rendu PDF et compatibilité historique.
Intégration locale : rollback/compteur, calcul transactionnel, snapshot gelé après
configuration, refus UUID étranger et protections SQL. Les tests existants couvrent
RBAC/RLS, anonymes et membership inactif. E2E : date/commande puis émission et PDF.

Hors portée : acomptes/prestations futures, fiscalité internationale et exceptions
sectorielles, clauses B2G exhaustives, garanties particulières B2C, rectificatifs
hors avoirs réductifs [M4](credit-notes.md), archivage/rétention durables de production
au-delà de M5B et M7 plateforme/e-reporting. M6 Unicode est livré techniquement. La seule présence de
mentions ne permet pas de déclarer First AI fiscalement conforme.

Références officielles vérifiées le 2026-10-06 :
[mentions](https://entreprendre.service-public.gouv.fr/vosdroits/F31808),
[délais B2B](https://entreprendre.service-public.gouv.fr/vosdroits/F23211),
[CGI annexe II art. 242 nonies A](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050811276).
