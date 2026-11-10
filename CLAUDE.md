# Projet : site Pokémon (Pokédex + collection de cartes)

## Objectif

Construire un site web **100 % statique** permettant :

1. De **naviguer parmi tous les Pokémon** (liste, recherche, filtres, fiche détaillée avec un maximum d'infos).
2. De gérer une **collection de cartes à collectionner** (parcourir les cartes, marquer celles qu'on possède).

Langue du site et des données affichées : **français** (noms, descriptions, types, capacités).
Langue d'échange avec l'utilisateur : français.

## Contraintes (non négociables)

- **Hébergement gratuit** : GitHub Pages en priorité, Vercel en solution de repli.
  - Coolify est écarté : c'est un outil à installer sur son propre serveur (VPS), donc pas gratuit côté hébergement.
- **Aucune base de données, aucun serveur applicatif.**
- Données = **fichiers JSON statiques** versionnés dans le dépôt (pas de markdown, le JSON suffit) + cache navigateur.
- **Stack légère** : HTML + CSS (Pico.css ou Tailwind) + JavaScript « vanilla ».
  - Pas de jQuery : `fetch()` est natif et suffit.
  - Alpine.js acceptable pour l'interactivité sans build.
  - Vite acceptable si le site grossit (GitHub Pages sait servir le dossier `dist/`).
- Aucune clé d'API secrète dans le code front (tout ce qui est dans le JS est public).

## Sources de données

### Pokémon : PokéAPI (source principale)

- https://pokeapi.co : gratuite, sans clé, REST (variante GraphQL existante).
- CORS autorisé depuis le navigateur.
- Les listes ne renvoient que des noms/URLs : il faut une requête par Pokémon pour le détail.
- **Noms français** : endpoint `pokemon-species/{id}`, champ `names`, entrée où `language.name == "fr"`.
- **Descriptions françaises** : `pokemon-species/{id}`, champ `flavor_text_entries`, filtrer sur `language.name == "fr"`.
- Autres endpoints utiles : `pokemon/{id}` (stats, types, capacités, sprites), `evolution-chain/{id}`, `type`, `move`, `ability`.
- Sprites / artworks : dépôt GitHub `PokeAPI/sprites`.
- PokéAPI demande de **mettre les réponses en cache** et de ne pas l'interroger à chaque visite.

### Autres sources Pokémon (optionnelles)

- **Tyradex** : API communautaire francophone (noms et descriptions FR directs). Moins établie : à tester avant de s'y fier.
- **Pokémon Showdown** (dépôt `smogon/pokemon-showdown`) : stats, learnsets, formats compétitifs, si une section compétitive est voulue.

### Cartes à collectionner

- **TCGdex** (https://tcgdex.dev) : recommandé. Multilingue (FR inclus), sans clé, appelable directement depuis le navigateur, SDK JS disponible.
- **Pokémon TCG API** (https://pokemontcg.io) : très complète, surtout en anglais. Une clé améliore les limites, mais elle serait visible dans le JS front : à éviter ou à utiliser sans clé avec limites basses.
- Les appels cartes se font **en direct depuis le navigateur**, avec un petit cache (`localStorage` / IndexedDB).

> ⚠️ L'état actuel de ces services (conditions d'usage, limites de requêtes, maintenance, format exact des réponses) n'a **pas été revérifié**. Consulter leur documentation avant de coder.

## Architecture retenue

### Principe : pré-génération des JSON (recommandé)

Un script Node, lancé manuellement ou par **GitHub Action** (planifiée ou à la demande), interroge PokéAPI et écrit des JSON **allégés** dans le dépôt. Le site ne charge que ces fichiers statiques :

- rapide ;
- indépendant de la disponibilité de PokéAPI ;
- ne consomme pas ses quotas.

Fichiers générés :

- `data/index.json` : pour tous les Pokémon, uniquement id, nom FR, types, sprite (liste, recherche, filtres).
- `data/pokemon/{id}.json` : fiche détaillée (stats, taille/poids, talents, évolutions, capacités, descriptions FR, faiblesses éventuellement calculées).
- `data/types.json` : types FR et table des efficacités.

Approche écartée comme principale : appels directs à PokéAPI depuis le navigateur avec cache `localStorage`. Les réponses brutes sont lourdes et saturent vite le `localStorage` (~5 Mo). Elle reste possible comme repli.

### Script de génération (`scripts/generate-data.mjs`)

- Node 18+ (`fetch` natif), aucune dépendance si possible.
- Limiter la concurrence des requêtes (ex. 5 à 10 en parallèle) et gérer les erreurs / reprises.
- Ne garder que les champs utiles (supprimer les gros blocs inutiles des réponses brutes).
- Sortie déterministe (ordre stable des clés) pour que les diffs Git restent lisibles.
- Option « ne régénérer que ce qui manque » pour éviter de tout retélécharger.

### Collection de cartes

- La collection de l'utilisateur (cartes possédées) est stockée dans **`localStorage`** : pas de compte, pas de base.
- Prévoir un bouton **Export / Import JSON** pour sauvegarder la collection ou la transférer d'un appareil à un autre.

## Structure de dossier visée

```
/
├── CLAUDE.md
├── index.html              # liste / recherche des Pokémon
├── pokemon.html            # fiche détaillée (?id=25)
├── collection.html         # partie cartes
├── assets/
│   ├── css/
│   ├── js/
│   └── img/                # uniquement les images nécessaires, hébergées localement
├── data/
│   ├── index.json
│   ├── types.json
│   └── pokemon/{id}.json
├── scripts/
│   └── generate-data.mjs
└── .github/workflows/
    ├── deploy.yml          # déploiement GitHub Pages
    └── update-data.yml     # régénération optionnelle des JSON
```

## Points techniques à respecter

- **Chemins relatifs uniquement** (pas de `/data/...` absolu) : un site GitHub Pages « projet » est servi sous `/nom-du-repo/`, les chemins absolus casseraient.
- **Pas de routage côté serveur** sur GitHub Pages : utiliser des pages séparées avec paramètres d'URL (`pokemon.html?id=25`) ou un routage par hash (`#/pokemon/25`).
- **Images** : n'embarquer que le nécessaire (ex. un sprite + l'artwork officiel par Pokémon), les héberger dans le dépôt plutôt que de les appeler en direct depuis un dépôt tiers. Tous les sprites de PokéAPI pèsent lourd, et GitHub Pages recommande de rester sous ~1 Go de site. Utiliser `loading="lazy"` et des formats légers (WebP).
- **Cache navigateur** : versionner les clés de cache (`localStorage`/IndexedDB) pour pouvoir invalider après une régénération des données.
- **Accessibilité et mobile** : design responsive, contrastes corrects, navigation clavier.
- **Perf** : la liste des ~1000+ Pokémon doit rester fluide (pagination, « infinite scroll » ou virtualisation, recherche locale sur `index.json`).

## Aspects légaux

Pokémon appartient à Nintendo, Creatures et Game Freak. Un projet de fan non commercial ne pose en général pas de problème, mais rester prudent si le site devient commercial (images, logos, noms). Ne pas utiliser le logo Pokémon officiel comme identité du site.

## Plan de travail proposé

1. **Initialiser le dépôt** : structure de dossiers, `.gitignore`, README court.
2. **Script de génération** des JSON (noms FR inclus), lancé une première fois pour produire `data/`.
3. **Page liste** : affichage, recherche par nom FR, filtres par type / génération.
4. **Page fiche détaillée** : stats, types, évolutions, capacités, descriptions FR, artwork.
5. **Partie collection** : recherche de cartes via TCGdex, marquage « possédée », stockage `localStorage`, export/import JSON.
6. **Déploiement** : workflow GitHub Pages (et éventuellement Action de mise à jour des données).
7. **Finitions** : responsive, accessibilité, performance, optimisation des images.

## Questions ouvertes (à trancher avec l'utilisateur)

- Framework CSS : Pico.css (minimal), Tailwind (plus flexible), ou CSS maison ?
- JS vanilla seul, ou Alpine.js ?
- Périmètre des données : toutes les générations ? Formes régionales / méga-évolutions / formes alternatives ?
- Faut-il une section compétitive (données Showdown) ou seulement le Pokédex « grand public » ?
- Nom du dépôt et du site (impacte le chemin de base sur GitHub Pages).

## Conventions de travail

- Répondre et commenter le code en **français**.
- Garder la stack minimale : ne pas ajouter de dépendance ou d'outil de build sans nécessité.
- Avant d'écrire du code qui dépend d'une API externe, vérifier sa documentation actuelle.
- Proposer des livrables par étapes (script de données, puis liste, puis fiche, puis collection) plutôt qu'un gros bloc d'un coup.
