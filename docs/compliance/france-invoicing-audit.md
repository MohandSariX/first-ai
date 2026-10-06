# Audit de facturation française — FIRST AI

Audit documentaire et technique du **5 octobre 2026**. **Conformité non établie ;
implémentation des corrections en attente.** Ce document spécifie les prochains
jalons ; il ne constitue ni certification, ni avis juridique individualisé, ni
autorisation d’utiliser les factures actuelles en production.

## 1. Méthode et preuves

Documents lus : AGENTS, mémoire de projet, DATABASE, DOMAIN, SECURITY, TOOLS et
les trois documents techniques [factures](../architecture/invoices.md),
[paiements](../architecture/payments.md), [documents/PDF](../architecture/invoice-documents.md).

Implémentation inspectée :

- `packages/database/src/schema/{organizations,customers,invoices,payments}.ts` ;
  migrations `0010_confused_photon.sql`, `0011_salty_namorita.sql`,
  `0012_flawless_havok.sql` et inventaire de l’historique Drizzle.
- `packages/database/src/repositories/{invoices,payments}.ts` ;
  `packages/tools/src/{invoice-service,invoice-document,invoice-pdf,payment-service,quote-calculation,invoice-tools}.ts`.
- `packages/schemas/src/{invoices,invoice-document,payments}.ts` ; permissions
  `packages/auth/src/permissions.ts` et résolution `current-user.ts`.
- Pages `/invoices`, `/invoices/[id]`, action serveur `operational-actions.ts`,
  handler `GET /api/invoices/[id]/pdf` et auth serveur web.
- Tests `invoices.test.ts`, `payments.test.ts`, `invoice-document.test.ts`,
  `invoices.integration.test.ts`, E2E `invoices.spec.ts` et `invoice-documents.spec.ts`.
  Scripts racine inspectés ; tests non réexécutés pendant cet audit documentaire.

PDF réellement contrôlé : artefact fictif existant du test
`invoice-document.test.ts`, `/private/tmp/first-ai-invoice-qa.pdf`, créé le
5 octobre 2026. Texte extrait et page A4 rendue/inspectée avec l’outillage PDF
déjà disponible hors repository. Numéro FAC-2026-000001 ; HT 200,00 € ; TVA
20 % et 5,5 % = 25,50 € ; TTC 225,50 € ; saisie partielle 100,00 € ; reste
125,50 €. L’encart daté du 6 octobre est une **valeur de fixture**, pas un
encaissement réel ni une validation du service de saisie des dates futures.
Les branches optionnelles SIRET/TVA sont vérifiées dans le renderer, pas présentes
dans ce PDF dont les identifiants fictifs sont null.

Les constats de code sont distincts des règles officielles et des recommandations.
Une colonne ou un test technique ne prouve pas à lui seul une conformité juridique.
Aucune connexion métier, écriture DB, migration, installation ou exécution IA effectuée.

## 2. Registre des sources officielles

Toutes les URL ci-dessous ont été consultées ; les dates sont celles affichées
par l’éditeur, ou « non indiquée » si absentes. Les textes sont lus dans leur
version applicable à la date d’audit, pas selon un ancien résultat de recherche.

| ID / titre | Éditeur | Version/date affichée | Règle utilisée |
| --- | --- | --- | --- |
| [S1 — Mentions obligatoires sur une facture][s1] | DILA / Service Public Entreprendre | 11/08/2026 | Identités selon forme juridique ; mentions particulières ; calendrier des quatre nouvelles données. |
| [S2 — Tout savoir sur la facturation][s2] | DILA | 07/08/2026 | Émission, brouillons, corrections et avoirs ; pagination. |
| [S3 — CGI annexe II, article 242 nonies A][s3] | Légifrance | Depuis 01/01/2025, notes d’entrée en vigueur 2026/2027 | Mentions fiscales, exceptions de facture simplifiée, TVA client conditionnelle, données nouvelles. |
| [S4 — Code de commerce, L441-9][s4] | Légifrance | 26/04/2019–01/01/2027 | Facturation professionnelle, adresses, bon de commande, escompte et pénalités. |
| [S5 — BOI-TVA-DECLA-30-20-20-10][s5] | DGFiP / BOFiP | 18/10/2013, version renvoyée par l’URL courante | §§ 70–140 : séquence à l’émission ; §§ 160–300 : lignes et TVA. |
| [S6 — Délais de paiement entre professionnels][s6] | DILA / ministère de l’Économie | 07/08/2026 | Délais et taux B2B ; ne pas figer un taux variable dans le code. |
| [S7 — Code de commerce, D441-5][s7] | Légifrance | Depuis 27/02/2021 | Indemnité forfaitaire de recouvrement : 40 €. |
| [S8 — Code de commerce, R123-237][s8] | Légifrance | Depuis 15/05/2022 | Mentions d’identification/RCS/EI et situations particulières. |
| [S9 — Délais de conservation des documents][s9] | DILA | 01/07/2024 | Pièces comptables : dix ans à compter de la clôture ; délai fiscal distinct. |
| [S10 — Code de commerce, L123-22][s10] | Légifrance | Depuis 04/01/2003 | Conservation comptable dix ans et absence d’altérations. |
| [S11 — CGI, article 289][s11] | Légifrance | Depuis 31/12/2023 ; recodification annoncée au 01/01/2027 | Dates, doubles, rectifications, authenticité/intégrité/lisibilité et piste d’audit. |
| [S12 — BOI-TVA-DECLA-30-20-20-20][s12] | DGFiP / BOFiP | 19/01/2022, version courante | §§ 180–270 : référence initiale et corrections HT/TVA. |
| [S13 — Mentions obligatoires : tout savoir][s13] | Ministère de l’Économie / Bercy infos | 25/02/2026 | Prix, réductions, identités, mentions conditionnelles. |
| [S14 — Je découvre la facturation électronique][s14] | DGFiP | Publié 16/10/2024, modifié 26/05/2026 | Périmètre, e-reporting d’encaissement, PDF ordinaire insuffisant. |
| [S15 — À partir de quand suis-je concerné ?][s15] | DGFiP | Publié 15/11/2024, modifié 16/01/2026 | Calendrier réception/émission/e-reporting. |
| [S16 — Facturation électronique et plateformes agréées][s16] | DGFiP | Date éditoriale non indiquée | Rôle des plateformes ; limites d’une solution compatible non agréée. |
| [S17 — Spécifications externes et normes][s17] | DGFiP / AIFE | Modifié 02/07/2026 ; spécifications V3.2 du 30/04/2026 | Services annuaire/déclaration, renvoi aux normes XP Z12-012/013/014. |
| [S18 — Ouverture de l’annuaire][s18] | DGFiP / AIFE | 18/09/2025 | Annuaire destinataires, plateformes et adresses électroniques de facturation. |
| [S19 — Livret DGFiP, fiche 1-f-v][s19] | DGFiP | Date de version non indiquée dans le PDF consulté | Glossaire p. 11 : UBL/CII/Factur-X ; distinctions franchise/exonération. Exemple de livret PME, pas calendrier universel. |
| [S20 — Arrêté 83-50/A, articles 1 et 3][s20] | Légifrance | Article 1 depuis 09/09/2010 ; texte consolidé au 05/10/2026 | Note de services B2C, seuil 25 € TTC, unité et lieu/date d’exécution. |
| [S21 — BOI-TVA-DECLA-30-10-30][s21] | DGFiP / BOFiP | 25/03/2026 | Champ des logiciels d’encaissement, exclusions et preuve de sécurisation. |

Points de lecture à conserver : S2 présente le seuil B2C comme « supérieur à
25 € » ; **S20 inclut 25 € exactement** : retenir le texte réglementaire.
Les synthèses S1/S13 présentent parfois les identifiants TVA de façon générale :
S3 distingue les cas et les exceptions, notamment certaines opérations internationales.
Ne pas convertir le seuil simplifié 150 € HT en dispense universelle.
L’adresse de livraison des **biens** de S3 n’est pas une obligation universelle
d’adresse d’intervention pour tous les services ; le modèle peut garder les deux
concepts séparés. Vérifier les mappings de la future plateforme.
Plusieurs références CGI sont annoncées recodifiées en 2027 : revérifier les
références légales et versions avant chaque implémentation, sans anticiper leur
abrogation dans cet audit d’octobre 2026. [S3][s3], [S11][s11], [S20][s20]

## 3. Applicabilité : qualification indispensable

« ALWAYS REQUIRED » signifie obligatoire **dans le périmètre de facturation
identifié**, pas que chaque vente à chaque particulier impose la même facture.
La forme juridique, la taille, le régime TVA et les opérations réelles de First AI
Demo ne sont pas déductibles du seul nom de l’organisation ; aucun profil fiscal
ou statut d’entreprise réel n’a été présumé.

| Situation | Classification et conséquence | Source |
| --- | --- | --- |
| Achat pour activité professionnelle | ALWAYS REQUIRED : facture professionnelle ; vérifier aussi la qualité d’assujetti pour le canal électronique. | [S4][s4] |
| Particulier, services | CONDITIONALLY REQUIRED : note dès 25 € TTC, ou sur demande sous ce seuil ; date/lieu/unité. Pas de forfait B2B 40 €. | [S20][s20], [S7][s7] |
| Particulier, biens | CONDITIONALLY REQUIRED : facture notamment sur demande/vente à distance ; garanties pour catégories concernées, pas toutes prestations. | [S2][s2], [S13][s13] |
| TVA française facturée | NEEDS BUSINESS CONFIGURATION : taux applicable, identifiants et dates fiscales ; capacité de calcul ne valide pas le taux choisi. | [S3][s3] |
| Franchise en base | CONDITIONALLY REQUIRED : mention dédiée, pas de TVA facturée ; reste assujetti pour la réforme. | [S1][s1], [S19][s19] |
| Exonération de l’opération | CONDITIONALLY REQUIRED : motif/base juridique ; ne pas confondre franchise et exonérations 261–261 E. Les opérations exonérées concernées sont hors émission/reporting, mais réception fournisseur à qualifier. | [S3][s3], [S19][s19] |
| B2B domestique entre assujettis établis en France | FUTURE / ELECTRONIC-INVOICING REQUIREMENT : applicable déjà selon taille/calendrier ; franchise incluse. | [S14][s14], [S15][s15] |
| B2C ou opérations internationales | CONDITIONALLY REQUIRED : e-reporting selon opération/régime ; pas un envoi de facture électronique au consommateur. Territorialité, export/intracommunautaire/autoliquidation à qualifier. | [S14][s14] |
| Client public / marché public | CONDITIONALLY REQUIRED : flux Chorus Pro ; type CRM `public` n’est pas une intégration ni une qualification complète. | [S2][s2] |
| Assurances artisanales, biens spéciaux, autofacturation, régimes de marge | NOT CURRENTLY APPLICABLE au flux de services standard retenu pour les prochaines spécifications ; NEEDS BUSINESS CONFIGURATION si l’activité réelle déclenche ces cas. Ne pas présumer qu’une activité nuisibles est hors artisanat. | [S1][s1], [S3][s3] |

Modèle minimal **recommandé**, non créé :

- Profil fiscal vendeur versionné : identité juridique, établissements/adresses,
  régime TVA, option débits, taille/calendrier, conditions de règlement validées.
- Identité de facturation client distincte du segment CRM : particulier/professionnel/
  organisme public, qualité d’assujetti, pays d’établissement, SIREN/SIRET/TVA et
  adresse légale/client + adresse de facturation éventuellement différente.
- Qualification par facture figée à l’émission : B2B/B2C/B2G, domestique/UE/hors UE,
  biens/services/mixte, traitement TVA avec motif si nécessaire ; adresse de
  livraison distincte lorsqu’applicable. Ne pas déduire ces valeurs du rôle Auth,
  d’un nom de client, de son secteur `hotel` ou de la seule présence d’un numéro TVA.
- SIREN peut être dérivé d’un SIRET **validé** lorsqu’approprié ; accepter aussi un
  SIREN indépendant. Ne pas tronquer silencieusement une chaîne non vérifiée.

## 4. Matrice des écarts

BLOCKER = empêche l’usage fiscal dans le cas concerné ; HIGH = risque production
majeur ; MEDIUM/LOW = amélioration ou limite ciblée ; FUTURE = jalon de préparation,
**sans nier une obligation déjà entrée en vigueur**. M0–M7 sont détaillés en §10.

| Exigence | Applicabilité | Source officielle | Support actuel FIRST AI | Écart | Sévérité | Jalon |
| --- | --- | --- | --- | --- | --- | --- |
| Numéro unique, continu, chronologique à l’émission | ALWAYS REQUIRED | [S5][s5] | UNIQUE tenant/numéro, verrou organisation, compteur annuel | Réservation au brouillon, ordre d’émission non garanti, trous parmi factures émises | BLOCKER | M2 |
| Date réelle d’émission | ALWAYS REQUIRED | [S5][s5] | issueDate + issuedAt | Date prévue choisie à création, pas réconciliée avec émission réelle | HIGH | M2 |
| Date d’opération/acompte distincte | CONDITIONALLY REQUIRED | [S3][s3], [S20][s20] | Job source facultatif, aucun champ snapshot | Fin de prestation/livraison/acompte non rendu ; lieu B2C absent | HIGH | M3 |
| Identité vendeur adaptée | NEEDS BUSINESS CONFIGURATION | [S1][s1], [S8][s8] | Nom/legalName, adresse, SIRET/TVA facultatifs | Pas de forme/capital/EI/SIREN explicite/RCS ; validation seulement nom/adresse | BLOCKER selon vendeur | M1 |
| Identité et adresse client/facturation | ALWAYS REQUIRED en B2B ; adaptations B2C | [S4][s4], [S13][s13] | Nom/legalName, identifiants facultatifs | Aucune adresse client ; snapshot met null, avertissement pas une dispense | BLOCKER B2B | M1 |
| Bon de commande acheteur | CONDITIONALLY REQUIRED | [S4][s4] | Notes libres seulement | Pas de référence structurée ni contrôle conditionnel | HIGH | M3 |
| Désignation précise / unité | ALWAYS REQUIRED dans le flux pertinent | [S5][s5], [S20][s20] | Description, quantité, prix HT | Texte générique accepté ; unité de mesure absente | MEDIUM | M3 |
| Réductions/frais acquis | CONDITIONALLY REQUIRED | [S13][s13] | Prix net saisi, lignes positives | Pas de réduction explicite/mécanisme exact ni frais qualifiés | HIGH si utilisés | M3 |
| HT, TVA par taux et TTC | ALWAYS REQUIRED / selon TVA | [S5][s5] | BigInt, NUMERIC, ventilation snapshot/PDF | Fondations exactes ; validation des taux/régimes non fiscale | LOW calcul ; HIGH qualification | M1/M3 |
| TVA vendeur/client et motifs | CONDITIONALLY REQUIRED | [S3][s3] | Champs facultatifs, simple taux 0 possible | Pas d’exigences conditionnelles, exonération/autoliquidation/franchise structurées | BLOCKER selon régime | M1/M3 |
| Échéance/escompte/pénalités | CONDITIONALLY REQUIRED B2B | [S4][s4], [S6][s6] | dueDate ; customer.paymentTermsDays non capturé | Conditions d’escompte, taux et contrôle des délais absents | HIGH | M3 |
| Indemnité 40 € | CONDITIONALLY REQUIRED B2B | [S7][s7], [S6][s6] | Absente | Pas de mention ciblée ; ne pas l’appliquer aux consommateurs | HIGH B2B | M3 |
| Qualification client/opération | NEEDS BUSINESS CONFIGURATION | [S14][s14], [S3][s3] | Type CRM, catalogue services | Pas de B2B/B2C/B2G ni biens/services/mixte ou territorialité fiscale | HIGH | M0/M1 |
| Données reforme : SIREN client/livraison/catégorie/débits | FUTURE / ELECTRONIC-INVOICING REQUIREMENT selon échéance | [S1][s1], [S3][s3] | SIRET/TVA facultatifs | Aucun modèle/rendu complet de ces données | BLOCKER si échéance applicable | M1/M3/M7 |
| Réception/émission via plateforme agréée | CONDITIONALLY REQUIRED selon calendrier | [S15][s15], [S16][s16] | PDF uniquement, aucune réception fournisseur | Réception 2026 non couverte ; émission/reporting non couverts | BLOCKER si concerné | M0 puis M7 séparé |
| Formats structurés, annuaire et cycle de vie | FUTURE / ELECTRONIC-INVOICING REQUIREMENT | [S17][s17], [S18][s18], [S19][s19] | JSON privé + PDF visuel | Pas de format d’échange, routage destinataire ni accusés/statuts plateforme | FUTURE ; HIGH si flux dû | M7 |
| Encaissement / e-reporting paiement | CONDITIONALLY REQUIRED | [S14][s14] | Date/montant manuels, corrections, idempotence | Pas d’exigibilité TVA ni ventilation/reporting légal | HIGH si reporting dû | M7 |
| Correction/avoir d’une facture émise | CONDITIONALLY REQUIRED | [S2][s2], [S12][s12] | Annulation brouillon seulement | Aucun avoir/rectificatif/ref original/solde corrigé | HIGH ; BLOCKER si correction nécessaire | M4 |
| Authenticité/intégrité/lisibilité et piste d’audit | ALWAYS REQUIRED | [S11][s11] | Snapshot/entête protégés, tenant/RLS | Items/suppression/statuts sous privilèges pas entièrement protégés ; audit incomplet | HIGH | M5 |
| Conservation comptable dix ans depuis clôture | ALWAYS REQUIRED pour pièces comptables | [S9][s9], [S10][s10] | JSON durable, pas d’API delete facture | Pas de politique, clôture, archive/original livré ni restauration validée | HIGH | M5 |
| Identités Unicode lisibles | Limite technique, pas prescription de police | [S11][s11] | WinAnsi ; refus explicite | Identités hors alphabet supporté bloquent le PDF | MEDIUM ; bloquant pour ces données | M6 |
| Sécurisation fonction encaissement B2C | NEEDS BUSINESS CONFIGURATION | [S21][s21] | Saisies mémorisées extra-comptables, espèces possibles | Qualification requise ; aucune preuve de conformité caisse établie | HIGH ; BLOCKER si applicable | M0/M5 dédié |

## 5. Numérotation et dates : conclusion de production

### Ce que garantit le code

`InvoiceRepository.create` verrouille le row organisation dans une transaction,
cherche le plus grand FAC de l’année d’`input.issueDate`, puis incrémente. La
contrainte unique protège les collisions ; les tests couvrent deux créations
concurrentes. Une annulation/soft-delete ne retire pas le numéro du calcul MAX.
Le retry d’émission conserve le snapshot et le numéro.

### Ce que cela ne garantit pas

- Brouillon 000001 abandonné, 000002 émis : trou dans la suite **émise**.
- Deux brouillons créés 000001 puis 000002, émission dans l’ordre inverse : ordre
  des numéros différent de la chronologie d’émission. Scénarios déduits du code,
  non expériences DB exécutées dans cet audit.
- issueDate peut être passée/future lors de la création ; `issuedAt = now()` ne
  la corrige pas. Le PDF affiche issueDate, pas la date de cette validation.
- La remise à 1 selon le préfixe annuel n’est pas à elle seule une garantie de
  régularité : continuité et chronologie restent à démontrer dans chaque série.
- La réservation repose sur les factures conservées : une suppression privilégiée
  du plus grand numéro peut permettre sa réutilisation. Aucun endpoint de suppression
  n’existe, mais aucune protection de rétention DB n’empêche l’administration.
- Capacité 999 999/an/organisation et format figé dans Zod ; pas d’import contrôlé
  d’un historique ou de changement de série. Le scope organisation suppose une
  organisation = un émetteur fiscal, à qualifier avant multi-établissement.

Règle recommandée (architecture proposée, **non implémentée**) : identifiant
brouillon distinct ; numéro fiscal alloué **lors de l’émission**, sous verrou
transactionnel tenant/série, avec snapshot/événement et date d’émission cohérente.
Compteur transactionnel durable, pas une séquence PostgreSQL `nextval` consommée
hors rollback ; échec d’émission ne consomme pas de numéro. Retry retourne le même
document, aucune réutilisation après émission. Garder FAC-YYYY si série annuelle
validée/documentée ; le préfixe annuel n’interdit pas le reset, mais ne justifie
ni trous ni antidatage. Conserver l’intégralité des séries historiques ; aucune
renumérotation silencieuse des factures déjà émises. Justification : numérotation
au fil de l’émission, non création du brouillon. [S5][s5]

Séparer date civile d’émission, instant UTC de validation, dates/périodes
d’exécution ou livraison, acompte et échéance. Les encaissements postérieurs
`payments.paidAt` ne remplacent pas la date fiscale d’un acompte. Un lien vers
un job completed ne capture pas sa date de prestation dans le document.
Prévoir les cas différés/périodiques seulement après qualification explicite. [S11][s11]

## 6. Mentions, TVA et paiement : spécification ciblée

Le profil vendeur actuel est réutilisable, mais incomplet pour sélectionner et
valider les mentions selon EI/société/immatriculation/activité. Nom commercial
ne suffit pas comme substitut automatique à l’identité légale. SIRET affiché
ne prouve pas que toutes les mentions d’immatriculation applicables sont présentes.
Pas de champ « RM » universel à ajouter aveuglément : vérifier RNE/RCS et mentions
artisanales selon le statut actuel, notamment assurance si exigée. [S1][s1], [S8][s8]

Adresse client : prévoir adresse identité et adresse de facturation éventuellement
distincte, snapshot des deux selon besoin ; jamais copier un site opérationnel
implicitement. Opposition d’un particulier ne devient pas une exemption générale
B2B. Conserver séparément livraison de biens et lieu d’intervention. [S4][s4], [S13][s13]

Le moteur exact est à préserver. Sa politique actuelle arrondit HT par ligne puis
TVA par ligne au centime ; la ventilation additionne ces montants. Une validation
fiscale de la politique d’arrondi et des cas limites reste à réaliser ; cet audit
ne déclare pas une seule méthode d’arrondi légalement universelle. Prix saisis,
réductions et frais doivent produire une base explicite reproductible. Pas de
ligne négative improvisée pour remplacer un avoir ; les inputs actuels sont positifs.

Taux 0 ≠ qualification d’exonération, franchise ou autoliquidation. Prévoir des
codes fiscaux/motifs versionnés et textes approuvés, jamais générés par LLM ni
choisis d’après le seul montant. Les identifiants TVA du client ne sont pas une
obligation uniforme de toutes les ventes domestiques/B2C. [S3][s3]

Settings règlement à définir par vendeur, éventuellement adaptés au contrat/client
et figés dans le snapshot : délai/échéance, escompte ou absence, règle et taux de
pénalités B2B, indemnité ciblée. Le délai de droit commun professionnel est 30 jours
après réception/exécution, avec délais convenus plafonnés et exceptions sectorielles.
Taux conventionnel au moins trois fois le taux légal, à défaut BCE + 10 points ;
ne pas hardcoder un pourcentage daté. Pas de pénalités/forfait professionnels
copiés automatiquement vers B2C ou marchés publics. [S6][s6], [S7][s7]

## 7. Document réellement rendu

| Exigence | Support visible actuel | Manque | Condition | Changement recommandé | Source |
| --- | --- | --- | --- | --- | --- |
| Titre, numéro, date, pagination | FACTURE, FAC, émission/échéance, numéro en pied n/N | Chronologie/date juridiquement qualifiées | Facture émise | M2, pas retouche seulement visuelle | [S2][s2], [S5][s5] |
| Vendeur | Nom légal ou nom, adresse ; SIRET/TVA/contact si présents | Forme/capital/EI/RCS, contrôles conditionnels | Statut vendeur | M1 + snapshot enrichi | [S1][s1], [S8][s8] |
| Client | Nom, contacts ; SIRET/TVA optionnels | Adresse explicitement non renseignée | B2B notamment | M1 ; ne pas supprimer l’avertissement avant correction | [S4][s4] |
| Exécution, commande, livraison | Aucun champ dédié | Dates/lieu/référence/adresse nécessaires selon cas | Opération/commande | M3 | [S3][s3], [S20][s20] |
| Détail ligne | Description, Qté, PU HT, taux et HT | Unité, réductions, validation désignation | Lignes concernées | M3 | [S5][s5], [S13][s13] |
| TVA multiple | Bases et montants séparés à 5,5 %/20 %, total TVA | Motifs fiscaux non chiffrés | Exonération/franchise/autoliquidation | M3 ; garder calcul/rendu exact | [S3][s3] |
| Totaux | 200,00 € HT / 25,50 € TVA / 225,50 € TTC | Aucun écart arithmétique constaté sur la fixture | EUR, TVA normale | Tests supplémentaires d’arrondi, pas IA | [S5][s5] |
| Règlement B2B | Échéance seule | Escompte, taux de retard, forfait | Professionnel / exceptions | M3, textes configurés figés | [S4][s4], [S7][s7] |
| Encaissements actuels | Partiellement réglée, 100,00 € enregistrés, 125,50 € dû ; avertissement bancaire | Preuves et audit exhaustif absents | Information application | Encadré distinct, pas preuve fiscale/bancaire | [S11][s11] |
| Mentions reforme | Aucune catégorie ou option débits | SIREN client explicite/livraison/catégorie/débits | Calendrier/operation | M3 données puis M7 transport | [S1][s1] |
| Lisibilité | Mise en page A4 lisible, accents WinAnsi | Noms Unicode hors WinAnsi refusés | Données multilingues | M6 fontes embarquées avec licence/couverture validées | [S11][s11] |
| Facture électronique | PDF visuel uniquement | Données structurées, plateforme, routage | Flux réforme | M7 séparé ; PDF ne suffit pas | [S14][s14], [S19][s19] |

L’avertissement « conformité fiscale non validée » protège contre une fausse
promesse, **pas contre l’absence de mentions obligatoires**. Le PDF technique
ne doit pas être présenté comme facture de production conforme.

## 8. Corrections, paiements, immutabilité et conservation

### Corrections

Original émis conservé : pas d’édition silencieuse. S2 décrit un rectificatif
avant paiement, puis un avoir pour correction après règlement ; S12 encadre
références et corrections TVA. Recommander un jalon avoirs/rectificatifs explicite,
pas rendre `cancelInvoice` applicable aux factures émises. [S2][s2], [S12][s12]

Spécification future : document correctif tenant-scopé, référence au numéro/date
et ID original, motif/auteur/date, montants HT/TVA corrigés par taux, numérotation
propre continue ou série fiscalement justifiée. Représenter le crédit par type de
document/signe comptable déterministe, non par prix positifs bricolés. Empêcher
sur-correction et double correction concurrente ; séparer compensation de dette,
crédit client et remboursement. Aucun remboursement bancaire automatique.
Le statut `written_off` ne constitue ni un avoir ni une procédure fiscale d’impayé.

### Encaissements

Le PDF distingue correctement corps commercial gelé et situation de paiement
actualisée. « Réglée » signifie somme des saisies completed, pas preuve bancaire.
Annuler une saisie ne rembourse pas et ne corrige pas une facture. Le futur modèle
d’avoir doit revoir le solde sans modifier les lignes/totaux du document initial.
Aujourd’hui zéro-total reste issued ; la suppression des reçus partiels peut perdre
un ancien statut overdue/sent. Ce sont des limites de cycle applicatif, pas une
nouvelle conclusion juridique sur l’encaissement.

Le caractère manuel ne dispense pas automatiquement des règles caisse : le
service mémorise des encaissements sans écriture comptable automatique, accepte
les espèces et peut viser des particuliers. Qualifier le champ S21 et ses
exceptions (B2B exclusif, franchise/exonération, modalités bancaires) avant usage
production B2C. En 2026, certificat ou attestation éditeur selon les conditions
officielles ; **aucune attestation ou certification de First AI n’est établie**.
Un simple avertissement bancaire ne satisfait pas ce dispositif. [S21][s21]

### Protection et conservation

Bon socle : capture transactionnelle, versions DTO, trigger UPDATE pour snapshot
et entête commercial, validation active/rôle lors émission/download, permissions
financières, RLS et FK composites ; tests de profil modifié et rollback présents.
La garantie juridique vise authenticité, intégrité et lisibilité sur la durée,
avec contrôles/piste d’audit ou autre dispositif admissible, pas seulement JSON. [S11][s11]

Limites : pas de protection DELETE de facture émise ; cascade items possible sous
privilèges ; items émis protégés au service mais pas par trigger ; INSERT privilégié
peut créer un état émis historique sans snapshot ; status/deletedAt et plusieurs
métadonnées administratives ne sont pas gelés. Ledger agrégé contournable par SQL
privilégié ; pas de journal complet des mutations humaines. Les fixtures effacent
volontairement leurs données fictives : ne pas assimiler leur cleanup à une
politique de conservation de factures réelles.

Conservation des pièces comptables : **dix ans depuis la clôture de l’exercice**.
Le délai fiscal de six ans n’autorise pas une purge des pièces comptables au bout
de six ans. La note B2C a aussi ses règles propres ; ne pas utiliser son délai
minimal pour réduire celui d’une pièce justificative comptable. [S9][s9], [S10][s10], [S20][s20]

Production à spécifier : clôture comptable par émetteur, dates de rétention,
interdiction purge/masquage irréversible avant échéance, sauvegardes/restauration,
accès contrôlé/export lisible, preuves sources et journal de corrections.
Conserver la version réellement délivrée et son intégrité, plus snapshot/version
de rendu et liens justificatifs. Générer à la demande est utile mais ne prouve pas
la conservation de l’original : changement de template/librairie/police et encart
paiement dynamique peuvent changer les bytes. Une empreinte seule n’est pas une
archive ; pas d’obligation universelle de WORM ou de PDF/A affirmée ici.

## 9. Réforme électronique : chantier distinct

Calendrier confirmé pour les entreprises/flux concernés : [S15][s15]

| Date | Réception | Émission électronique et e-reporting |
| --- | --- | --- |
| 01/09/2026 | Toutes tailles | Grandes entreprises et ETI |
| 01/09/2027 | Déjà exigée | PME/TPE/micro-entreprises |

Au 05/10/2026, la réception n’est **plus une obligation future**. First AI ne la
couvre pas. Une entreprise concernée doit organiser sa réception via une plateforme
agréée, même si le connecteur First AI reste différé ; aucun partenaire n’a été
sélectionné/contacté par cet audit. Ne pas déduire une échéance PME de la RAM de
la machine ou du caractère « demo » du tenant. [S15][s15], [S16][s16]

Trois flux à distinguer : factures B2B domestiques ; données des transactions
hors ce périmètre ; données d’encaissement lorsque TVA exigible à l’encaissement,
notamment services sans option débits ni autoliquidation. Le ledger manuel n’est
pas un e-reporting validé et n’alloue pas actuellement chaque paiement aux bases
de TVA. Les exclusions/situations internationales doivent être évaluées, pas
regroupées dans « toutes les factures ». [S14][s14]

Les quatre données nouvelles suivent leur entrée en vigueur applicable : SIREN
client professionnel, livraison de biens distincte, catégorie biens/services/mixte,
mention option débits lorsqu’exercée. Les champs et leur mapping doivent être
structurés, non un bloc de notes libres. [S1][s1], [S3][s3]

**PDF ordinaire ≠ facture électronique conforme à la réforme.** Le socle officiel
inclut UBL, CII et Factur-X (PDF + XML structuré), pas PDFKit seul. Une plateforme
peut convertir un format : First AI n’a pas à implémenter les trois sans cahier
de mapping choisi. Annuaire = adressage/plateforme du destinataire, pas email CRM.
La solution métier ne remplace pas la plateforme agréée ; le PPF assure notamment
annuaire/déclaration et n’est pas à présumer un transport B2B gratuit direct pour
First AI. Réception/émission, données fiscales et retours de cycle de vie doivent
être convenus avec le partenaire. [S16][s16], [S17][s17], [S18][s18], [S19][s19]

Le prochain cadrage connecteur doit relire V3.2 et les versions applicables des
normes/API référencées par la DGFiP. Ce présent audit n’a pas validé toutes leurs
annexes/XSD ni un mapping complet de champs : **pas de promesse de readiness**.
Chorus Pro/B2G reste un flux spécifique à cadrer si clients publics concernés. [S2][s2], [S17][s17]

## 10. Plan ordonné d’implémentation — non exécuté

### M0 — Qualification fiscale et readiness réception (priorité immédiate)

- Faire valider type légal/taille/TVA/activité/clientèle/territorialité par l’émetteur
  et son conseil. Définir les flux explicitement supportés ; refuser ceux non cadrés.
- Vérifier réception plateforme/annuaire si échéance déjà applicable ; peut être
  organisée hors First AI sans mélanger connecteur et développement PDF.
- Qualifier précisément le suivi encaissement B2C au regard de S21 et définir le
  chantier de sécurisation/preuve nécessaire, distinct d’une connexion bancaire.
- Livrable : matrice applicable par profil + scénarios acceptés/refusés ; aucune
  attestation automatique fondée sur les seuls tests techniques.

### M1 — Identités de facturation et classification

**Statut d’implémentation : livré techniquement**, migration additive 0013,
profils structurés/UI, classification explicite et snapshot v2 des nouvelles
émissions. Voir [périmètre, contrôles et limitations M1](../architecture/billing-identities.md).
La matrice ci-dessus reste le constat historique du 05/10/2026, pas une matrice
réécrite pour prétendre à la conformité ; M2 est livré techniquement ci-dessous,
M3–M7 et la qualification M0 restent ouverts.

- Petit modèle/UI vendeur et adresses client distinctes ; données fiscales
  qualifiées et champs conditionnels, aucune adresse de site implicite.
- Étendre le snapshot versionné aux identités et qualifications retenues ; bloquer
  l’émission si données applicables manquantes. Pas de backfill historique inventé.
- Tests : société/EI, professionnel/particulier/public, franchise/exonération,
  adresse distincte, données incomplètes, édition profil après émission, tenant/RLS.

### M2 — Cycle de numéro fiscal et dates

**Statut d’implémentation : livré techniquement**, migrations additives 0014/0015,
référence interne, compteur transactionnel privé, date serveur/fuseau et snapshot v3.
Voir [garanties, reprise legacy et limites M2](../architecture/invoice-numbering.md).
Les constats de l’audit restent historiques ; aucune conformité globale certifiée.

- Référence brouillon séparée ; allocation atomique au commit d’émission,
  date réelle/chronologie, séries annuelles documentées et compteur rollback-safe.
- Maintenir les anciens numéros émis ; reprise legacy et multi-émetteurs explicitement
  cadrées. Pas de renommage ni reset destructif de l’historique.
- Tests : concurrence, émission inversée de brouillons, abandon/annulation sans trou,
  rollback, retry, changement d’année/fuseau, date passée/future et capacité.

### M3 — Snapshot et PDF des mentions applicables

- Dates d’exécution/acompte, commande, unité, réductions/frais exacts, qualification
  TVA et textes validés, règlement/escompte/pénalités adaptés au client.
- Préparer les données supplémentaires réforme sans implémenter son transport.
- Tests matrice de profils, rendu textuel des mentions, non-application B2C du
  forfait B2B, TVA multi-taux/arrondis/réductions, incompatibilités rejetées.
- Garder la séparation snapshot original / encart manuel daté ; aucun AI arithmetic.

### M4 — Avoirs et rectificatifs

- Domaines/services explicites de correction partielle/totale, numérotation,
  références originales et impact déterministe sur soldes/crédits ; validation
  métier/comptable préalable du schéma, aucun remboursement caché.
- Tests non-réécriture original, sur-correction, retries/concurrence, tenant,
  facture déjà payée et combinaison avoir/encaissement/correction de saisie.

### M5 — Audit, immutabilité et rétention production

- Protéger documents/items/ledger contre mutations administratives ordinaires,
  tracer issue/correction/statuts/paiements, sans chaîne de pensée ni secrets.
- Conservation originale/snapshot/justificatifs et restauration sur la durée
  applicable ; clôture et purge contrôlées, documentation de piste d’audit.
- Cadrer séparément le dispositif de caisse si M0 l’exige ; aucun label de
  conformité créé sans preuve conforme. Tests tentatives SQL privilégiées,
  soft/hard delete, export/restore et audit atomique.

### M6 — PDF Unicode

- Fontes locales embarquées avec couverture/licence, fallback contrôlé, pagination
  et tests accents/identités internationales ; peut être avancé si M1 révèle ce besoin.
- Aucun remplacement silencieux de noms ; artefact original/version de rendu conservés.

### M7 — Intégration électronique dédiée

- Choisir une plateforme agréée et son contrat/API ; définir réception/annuaire,
  format accepté/mapping complet, transmission, retours/statuts, idempotence et audit.
- E-reporting transactions et encaissements avec corrections et exigibilité TVA ;
  branche Chorus Pro si applicable. Ne pas assimiler « reçu manuellement » à report validé.
- Tests contractuels/sandbox partenaire et validation officielle/comptable avant
  flux réel ; conserver PDF comme vue lisible, pas comme seul artefact réglementaire.

Cet ordre exprime des dépendances techniques, pas des délais de conformité :
**M7 doit être priorisé séparément si l’émetteur a déjà une obligation d’émission/reporting**.
La réception de M0 ne doit pas attendre M1–M6. Aucun connecteur, table, migration,
avoir ni mécanisme fiscal n’est ajouté par ce document. Tous les futurs jalons
conservent auth active, scope serveur, RLS, services déterministes et approval IA.

## 11. Validation et anomalies documentaires

Audit limité au repository et au rendu fictif, pas aux factures/clientèles réelles.
Les tests présents démontrent sécurité/calculs, pas mentions fiscales/continuité
d’émission/archive ; aucun résultat légal n’est déduit de leurs succès antérieurs.
Suites applicatives non relancées ; vérification Markdown/diff/statut uniquement.

Écart de texte UI observé, **non corrigé dans cet audit** : `/invoices` affiche
encore « Aucun paiement, PDF ou envoi » alors que suivi manuel et PDF sont livrés.
La mémoire et le document PDF technique décrivent correctement ces fonctionnalités.
Pas de changement de décision accepté : les ADR existantes restent inchangées ;
ce plan est une proposition d’implémentation à valider, pas son exécution.

[s1]: https://entreprendre.service-public.gouv.fr/vosdroits/F31808
[s2]: https://entreprendre.service-public.gouv.fr/vosdroits/F23208
[s3]: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050811276
[s4]: https://www.legifrance.gouv.fr/codes/id/LEGISCTA000038411053
[s5]: https://bofip.impots.gouv.fr/bofip/140-PGP.html/identifiant=BOI-TVA-DECLA-30-20-20-10-20131018
[s6]: https://entreprendre.service-public.gouv.fr/vosdroits/F23211
[s7]: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043197457
[s8]: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045710304
[s9]: https://entreprendre.service-public.gouv.fr/vosdroits/F10029
[s10]: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006219327/
[s11]: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048827413
[s12]: https://bofip.impots.gouv.fr/bofip/142-PGP.html/identifiant=BOI-TVA-DECLA-30-20-20-20-20220119
[s13]: https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/mentions-obligatoires-dune-facture-tout-savoir
[s14]: https://www.impots.gouv.fr/professionnel/je-decouvre-la-facturation-electronique
[s15]: https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation
[s16]: https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
[s17]: https://www.impots.gouv.fr/specifications-externes-b2b
[s18]: https://www.impots.gouv.fr/actualite/facturation-electronique-un-cap-determinant-est-franchi
[s19]: https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fiches_reforme/fiche-1_f_v.pdf
[s20]: https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000494187/
[s21]: https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325
