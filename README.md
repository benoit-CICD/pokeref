# PokéRef

Pokédex en français, 100 % statique (HTML + CSS + JavaScript sans dépendance), pensé pour GitHub Pages.

## Lancer le site en local

```bash
python3 -m http.server 8123
```

Puis ouvrir http://localhost:8123.

## Mettre à jour les données

```bash
node scripts/generate-data.mjs              # régénère data/ depuis PokéAPI (cache dans .cache/)
node scripts/generate-data.mjs --manquants  # n'écrit que les fiches absentes
node scripts/generate-data.mjs --frais      # ignore le cache et retélécharge tout
node scripts/fetch-images.mjs               # images WebP manquantes (nécessite cwebp)
```

Après une régénération, incrémenter `VERSION` dans `assets/js/commun.js` pour invalider le cache des navigateurs.

## Ajouter un article

Ajouter une entrée dans `data/articles.json`. Blocs disponibles : `p`, `h2`, `liste`, `encart`, `pokemon` (liste d'identifiants affichés en cartes).

Site de fans non officiel, sans but commercial. Données : [PokéAPI](https://pokeapi.co/).
