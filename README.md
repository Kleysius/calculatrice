# Thomas Instruments · TI-26

Calculatrice scientifique en HTML, CSS et JavaScript, sans dépendance ni étape de build.

## Fonctionnalités

- **Moteur de calcul maison** (plus d'`eval`) : priorités des opérations, parenthèses (refermées automatiquement), multiplication implicite (`2π`, `3(4+1)`), puissances, factorielle, pourcentages façon calculatrice de bureau (`200 + 10 %` = 220), et correction des erreurs d'arrondi (`0,1 + 0,2` = `0,3`).
- **Mode scientifique** (ƒx) : sin, cos, tan, ln, log, √, x², xʸ, 1/x, n!, π, e, Ans, en degrés ou en radians.
- **Aperçu en direct** du résultat pendant la saisie, coloration de l'expression, taille de police adaptée à la longueur du calcul.
- **Messages d'erreur clairs** (« Division par zéro », « Expression incomplète »…).
- **Historique** conservé entre les visites : un clic sur une entrée réutilise son résultat.
- **4 thèmes** : Aurore, Papier, Rétro LCD et Synthwave.
- **Clavier complet** : appuyez sur `?` pour afficher la liste des raccourcis. Copier/coller possible.
- **Mobile et PWA** : plein écran sur téléphone, retour haptique, installable et utilisable hors ligne.
- **Accessibilité** : navigation au clavier, libellés pour lecteurs d'écran, respect de `prefers-reduced-motion`.

## Lancer

Ouvrez `index.html` directement dans un navigateur, ou servez le dossier pour activer le mode hors ligne :

```sh
npm start        # ou : python3 -m http.server
```

## Tests

```sh
npm test         # tests du moteur de calcul (Node 18+)
```
