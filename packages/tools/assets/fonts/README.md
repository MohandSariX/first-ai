# Polices PDF First AI

Deux fontes statiques **Noto Sans**, non modifiées : `NotoSans-Regular.ttf` et
`NotoSans-Bold.ttf`. Aucun autre style/fallback n’est embarqué.

Source officielle : [notofonts/noto-fonts](https://github.com/notofonts/noto-fonts),
révision `ffebf8c1ee449e544955a7e813c54f9b73848eac`, répertoire
`hinted/ttf/NotoSans/`. Acquisition le 2026-10-07.

Licence **SIL Open Font License 1.1** : copyright et texte intégral dans
[OFL.txt](OFL.txt), provenant du [LICENSE de cette révision](https://github.com/notofonts/noto-fonts/blob/ffebf8c1ee449e544955a7e813c54f9b73848eac/LICENSE).
La licence autorise l’intégration/redistribution avec le logiciel et l’embarquement
dans les PDF, avec conservation de la notice/licence ; pas de vente isolée des fontes.
Les PDF produits ne sont pas soumis à l’OFL. Ne pas remplacer les fichiers sans
vérifier provenance/licence et incrémenter la version du renderer.

SHA-256 des assets distribués :

- Regular : `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`
- Bold : `c976e4b1b99edc88775377fcc21692ca4bfa46b6d6ca6522bfda505b28ff9d6a`

Couverture testée : français, Latin Extended (`Ł`, `Ž`, `Ș`, `œ`), ponctuation
typographique et euro. Pas de promesse Unicode universelle : CJK/emoji non couverts
par ces deux fichiers sont refusés. Assets serveur, jamais publiés sous `public/`
ou servis séparément au navigateur ; aucun téléchargement lors du rendu.
