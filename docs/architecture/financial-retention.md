# M5B — Conservation financière, originaux et vérification

Fondation technique locale, pas certification fiscale, archivage probant/WORM,
PDF/A, sauvegarde de production ni plan de reprise. Référence :
[audit français](../compliance/france-invoicing-audit.md), notamment conservation
comptable dix ans depuis la clôture de l’exercice, et [M5A](financial-audit.md).

## Politique et dates

`financial_retention_policies` porte une configuration explicite par organisation :
jour/mois de clôture annuelle, durée 10–50 ans, version et date de modification.
Aucune clôture n’est inférée de la création de l’organisation. OWNER/ADMIN seuls
configurent ; ACCOUNTANT peut exporter, MANAGER consulter, READ_ONLY/TECHNICIAN
ne gèrent pas les archives. Les permissions sont centralisées dans `auth`.

Pour la date civile d’émission dans le fuseau organisation, prendre la première
clôture annuelle supérieure ou égale, puis ajouter la durée. Exemple : clôture
30 juin, facture du 1 juillet 2026 → exercice clos le 30 juin 2027 → échéance
30 juin 2037 pour dix ans. Le 29 février n’est pas accepté comme clôture annuelle.
Ce modèle ne qualifie pas juridiquement un exercice exceptionnel, une modification
de clôture ou la date comptable de reconnaissance : ces cas exigent un cadrage
explicite avant production, sans purge fondée automatiquement sur cette approximation.

Sans politique, l’original est conservé mais clôture/échéance restent NULL.
L’export nécessitant des échéances refuse cette situation, même après configuration
ultérieure ; pas de backfill silencieux. Chaque artefact conserve la politique/version
et les dates utilisées à l’émission, indépendamment des changements ultérieurs.
Les justificatifs paiements/corrections/audit exportés portent une échéance calculée
avec la politique actuelle depuis leur date pertinente (paiement/correction/événement).
Ce n’est pas une autorisation de purge ni une affectation comptable certifiée.

## Original immuable et transaction

`financial_artifacts` : tenant, type/id du document, numéro, instant d’émission,
SHA-256, taille, version du renderer, clé de stockage, politique et échéances.
Les PDF des nouvelles factures et avoirs sont générés pendant l’émission depuis
les snapshots immuables, avec PDFKit existant, sans IA ni données CRM live.
L’original représente le fichier établi à l’émission, pas une preuve d’envoi,
de remise au destinataire ou d’acceptation : aucun email ni accusé de livraison.
Le PDF facture original omet le bloc dynamique d’encaissements. Les bytes ne sont
pas stockés dans PostgreSQL. Le snapshot v1–v4 facture et v1 avoir restent inchangés.

Émission + métadonnées + événement `*.artifact_persisted` sont atomiques en DB ;
un trigger différé impose la présence de l’original au commit. Les guards vérifient
document/tenant/numéro/date/politique et événement d’émission corrélé dans la même
transaction : pas d’original historique fabriqué après coup. Échec stockage/PDF
→ rollback de l’émission, du compteur fiscal et des événements de succès.
Le renderer WinAnsi existant peut refuser des caractères non supportés : l’émission
est alors refusée sans numéro consommé. Unicode reste M6, sans remplacement silencieux.

Le fichier doit être publié avant le commit DB : pas de transaction distribuée
DB/filesystem. Un rollback après publication peut laisser un fichier orphelin
inaccessible via l’application ; aucun nettoyage automatique n’est fourni. Une
intervention future devra être contrôlée, sans supprimer de références vivantes.
Retry d’émission retourne le document existant sans régénérer l’original ; download
vérifie taille et empreinte. Même clé avec bytes différents : refus, jamais overwrite.

## Stockage et privilèges

`FinancialArtifactStorage` expose seulement `put` et `read` serveur.
`LocalFinancialStorage` utilise `FINANCIAL_STORAGE_DIRECTORY`, sinon
`.financial-storage` sous le cwd serveur (ignoré par Git). Déploiement : chemin
absolu stable et volume durable à fournir ; le fallback n’est pas une configuration
de stockage production. Clés construites par le serveur :
`<tenant>/<invoice|credit_note|export>/<uuid>/<sha256>.<pdf|json>`.
UUID/clé/tenant validés, répertoires symlink refusés, fichier ouvert sans suivre
les symlinks ; publication par lien atomique sans écrasement, permissions restrictives.
L’OS propriétaire reste une frontière de confiance, notamment les races filesystem.

Aucune capability delete dans l’adapter ; guards SQL refusent UPDATE/DELETE/TRUNCATE
des artefacts/exports et DELETE/TRUNCATE des politiques. Les protections M5A continuent
de refuser hard/soft-delete des documents émis et suppressions paiements/audit/compteurs.
Même après échéance, aucune purge n’est disponible. Brouillons restent nettoyables.
RLS, contexte serveur actif frais et permissions contrôlent les lectures et mutations.
Les authenticated/service-role n’écrivent pas directement les nouvelles tables.
Propriétaires DB/OS peuvent contourner les protections : rien ici ne promet WORM,
signature, chiffrement, disponibilité, sauvegarde indépendante ou archive légale.
Une empreinte détecte une corruption accidentelle ; **un hash seul n’est pas une archive**.
Un conflit/corruption produit un refus et un log serveur structuré sans bytes/secrets ;
aucun événement de succès n’est fabriqué pour une transaction échouée.

## Downloads et historique

Routes authentifiées existantes `api/invoices/[id]/pdf` et `api/credit-notes/[id]/pdf`
servent l’original conservé, tenant/rôle/membership revérifiés, sans URL publique.
READ_ONLY peut lire les documents ; TECHNICIAN reste refusé.
`api/invoices/[id]/pdf?copy=current` sert une copie avec état courant déclaratif
des paiements/avoirs, jamais banque vérifiée ni original délivré.

Documents pré-M5B sans artefact : original non conservé à l’émission. Le download
peut reconstruire une copie depuis le snapshot existant, identifiée par UI,
filename et header `X-First-AI-Document`, sans persister de faux original.
Pas de snapshot historique → pas de PDF inventé. Les changements de renderer
n’altèrent jamais les bytes déjà préservés.

## Export et vérification

`/settings/retention` permet configuration, export borné et vérification du dernier
export ; `/api/financial-archives` est une frontière serveur validée/autorisée.
Format v1 **bundle JSON**, pas ZIP ni dump DB : `manifest` + fichiers encodés base64.
Sans dépendance supplémentaire, au plus 200 documents, 100 Mo, 10 000 paiements et
10 000 événements. Une période trop large échoue, sans troncature silencieuse.
Les corrections et originaux associés peuvent étendre la période pour cohérence.

Le manifest porte version, tenant/export UUID, date, période, fichiers, tailles et
SHA-256. `records.json` contient snapshots, provenance legacy/original, politiques,
échéances, paiements/corrections, événements et compteurs de numérotation scopés.
Pas de secrets/Auth, de notes internes CRM ou de chaîne de pensée.
Les fichiers PDF référencés sont les bytes originaux disponibles, pas des copies
régénérées. Les events export/verification eux-mêmes surviennent après le snapshot
repeatable-read et ne sont donc pas contenus dans leur propre export.

`verifyFinancialArchive` est une fonction offline sans connexion ni mutation DB,
sans extraction/chemin arbitraire : version/structure, doublons, fichiers présents,
références tenant/document, signature PDF, tailles et hash. Elle ne restaure rien,
ne prouve pas l’authenticité d’un export remanié avec nouveaux hashes et ne remplace
pas un exercice de restauration DB + fichiers. La vérification via service écrit
seulement un événement M5A `billing.archive_verified` de résultat ; export/configuration
écrivent leurs événements transactionnels. Aucun événement historique fabriqué.

## Validation et différé

Tests : clôture/frontières/incomplétude, originaux/retry/hash/échec stockage atomique,
immutabilité, legacy honnête, export/verifier/corruption/fichiers manquants, RLS/rôles/
UUID/révocation. Stockage test en répertoires temporaires isolés nettoyés ; cleanup
DB privilégié local et fixture-scopé seulement, aucune exception runtime.

Migration additive `0021_silly_deadpool.sql`, anciennes migrations inchangées.
M6 Unicode, M7 transport électronique, archivage durable/backup/restore réel,
contrôle administratif et qualification fiscale restent des chantiers distincts.
First AI n’est pas déclaré globalement conforme.
