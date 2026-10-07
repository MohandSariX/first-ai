# M6 — PDF Unicode

Fondation technique facture/avoir, **sans certification fiscale, PDF/A ou WORM**.
Aucune migration ni nouvelle dépendance npm. M7 et les garanties durables de
production restent distincts.

## Stratégie de fontes

`packages/tools/src/pdf-fonts.ts` est l’adapter Node partagé des deux renderers
PDFKit 0.20.2. Noto Sans Regular/Bold sont embarquées localement sous OFL 1.1 :
[assets, source/version, licence et hashes](../../packages/tools/assets/fonts/README.md).
Le repository ne contenait pas de fonte adaptée redistribuable ; les fontes système
ne constituent pas un contrat de distribution. Seulement deux fichiers (~1,1 Mio),
pas de famille énorme ni dépendance au système d’exploitation.

Node charge les deux chemins constants relatifs au package (identiques depuis
src/dist). Next.js/webpack les inline uniquement dans ses chunks serveur via une
règle ciblée : aucun asset font public/CDN, aucune fetch au rendu. Les buffers sont
chargés une fois ; chaque document possède son propre sous-ensemble PDFKit et ses
tables ToUnicode, permettant affichage/extraction hors de la machine génératrice.
Les packages déployés hors Next doivent conserver `assets/fonts` avec le package.
Toute distribution, y compris un bundle Next isolé, doit accompagner les fontes
embarquées de la notice/licence `OFL.txt` ; ne pas livrer uniquement les fontes/chunks
en supprimant cette notice.

Français/Latin Extended/noms européens, `œ`, `Łódź`, `Žák`, `Ștefan`, accents,
apostrophes/tirets typographiques et euro sont vérifiés. La couverture n’est pas
universelle : aucun fallback système implicite. Une seule famille suffit au scope
actuel ; les caractères absents (notamment CJK/emoji) échouent clairement, sans `?`.
Ajouter une autre famille exige une stratégie/version/tests/licence explicites.

Le guard vérifie chaque point de code dans la face utilisée ; CRLF/tabs sont
normalisés comme auparavant, contrôles non imprimables refusés. L’erreur indique
uniquement `U+XXXX`, jamais l’identité entière. Aucun chemin de fonte fourni par
formulaire/API. L’accès `_font.font.hasGlyphForCodePoint` à Fontkit est privé dans
PDFKit : adapter isolé, lié à la version épinglée, testé ; revalider lors d’un upgrade.

## Layout et contenu

Facture et avoir utilisent les mêmes fontes pour chaque texte, y compris titres,
continuations et pieds. Sections/positions/colonnes/limites 200 pages/20 Mio restent
inchangées ; retours à la ligne sont mesurés avec la nouvelle fonte. Pied facture
dans une boîte explicite afin d’éviter une page vide due aux métriques différentes.
Numéros/date définitifs, identités, TVA multi-taux/totaux exacts, mentions M3,
encart déclaratif de paiement et avertissement fiscal restent présents. Aucun
nouveau calcul ni changement métier. Factures v1/v2/v3/v4 et avoirs v1 restent lus
sans mutation de leurs snapshots.

## Originaux et versions

Nouveau renderer : `pdfkit-0.20.2/first-ai-original-v2-noto`.
Les nouvelles émissions produisent un original avec cette version et SHA-256 des
bytes réellement stockés. Nouvelle fonte/version implique nouveaux bytes/hashes ;
aucune tentative de conserver artificiellement l’ancienne empreinte.

Originaux M5B déjà préservés : aucune régénération/remplacement, y compris au retry
ou téléchargement ; leurs bytes/hashes/versions restent tels quels. Legacy sans
original : reconstruction au renderer actuel, toujours déclarée reconstituée par
les routes M5B. Copie actualisée de paiement séparée, jamais altération de l’original.
Une erreur de couverture lors d’une nouvelle émission annule la transaction et le
numéro, comme toute erreur PDF/stockage.

## Vérification

Tests unitaires décodant les opérateurs texte réels via ToUnicode (au lieu de WinAnsi),
accents/Latin Extended/styles, répétabilité, refus CJK/emoji, pagination facture/avoir,
totaux/TVA/mentions/solde et lecture legacy conservés. Tests locaux : émission
Unicode des deux originaux, version/hash, retries inchangés malgré édition CRM,
protections RLS/tenant/rôles/membership existantes conservées. E2E facture/avoir
utilisent des identités/motif/lignes Unicode fictifs et téléchargent réellement.

QA visuelle indépendante par rendu PyMuPDF en PNG : facture Unicode, avoir Unicode
et versions multipages ; extraction vérifie aussi identités/numéros/dates/totaux.
Fixtures et images dans stockage temporaire, jamais Git. Aucun appel IA ou service
PDF distant. Sources techniques : [PDFKit — Fonts](https://pdfkit.org/docs/text.html#fonts).

Validation M6 du 2026-10-08 : lint/typecheck/build, 221 unitaires, 97 intégrations
locales et 8 E2E passent. Cache webpack avertit sur les chaînes de fontes (~741/750 Kio)
inline ; logs dev NO_COLOR/fermeture de flux observés sans échec final de test.
Aucune migration, nouvelle dépendance npm, régénération d’original historique ou appel IA.
