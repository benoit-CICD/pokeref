// Fiche détaillée d'un Pokémon : pokemon.html?id=25

import {
  charger, el, numero, image, nombre, badgeType, boutonFavori, lireFavoris,
  COULEURS_TYPES, CATEGORIES, NOMS_STATS, afficherErreur,
} from './commun.js';

const STAT_MAX = 255; // plus haute statistique de base existante, sert d'échelle aux jauges
const conteneur = document.getElementById('fiche');
const id = Number(new URLSearchParams(location.search).get('id'));

const decimal = (valeur) => valeur.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

function bloc(titre, contenu, large = false) {
  return el('section', { class: `bloc${large ? ' bloc-large' : ''}` }, el('h2', {}, titre), contenu);
}

function blocStats(pokemon) {
  return bloc('Statistiques',
    el('dl', { class: 'stats' },
      Object.entries(NOMS_STATS).map(([cle, nom]) =>
        el('div', { class: 'stat' },
          el('dt', {}, nom),
          el('dd', {}, String(pokemon.stats[cle])),
          el('div', { class: 'jauge', 'aria-hidden': 'true' },
            el('i', { style: `--v:${Math.round((pokemon.stats[cle] / STAT_MAX) * 100)}%` })),
        )),
      el('div', { class: 'stat stat-total' }, el('dt', {}, 'Total'), el('dd', {}, String(pokemon.total)), el('span')),
    ),
  );
}

function blocSensibilites(pokemon, nomsTypes) {
  const groupes = [
    ['Craint beaucoup', (m) => m > 1],
    ['Résiste à', (m) => m > 0 && m < 1],
    ['Insensible à', (m) => m === 0],
  ];
  const libelle = (m) => (m === 0.25 ? '¼' : m === 0.5 ? '½' : String(m));
  const contenu = el('div', { class: 'sensibilites' });
  for (const [titre, test] of groupes) {
    const types = Object.entries(pokemon.sensibilites).filter(([, m]) => test(m)).sort((a, b) => b[1] - a[1]);
    if (!types.length) continue;
    contenu.append(
      el('h3', {}, titre),
      el('div', { class: 'types' }, types.map(([type, m]) => {
        const badge = badgeType(type, nomsTypes);
        if (m !== 0) badge.append(el('b', {}, `×${libelle(m)}`));
        return badge;
      })),
    );
  }
  return bloc('Forces et faiblesses', contenu);
}

function blocTalents(pokemon) {
  return bloc('Talents',
    el('ul', { class: 'talents' }, pokemon.talents.map((t) =>
      el('li', {},
        el('strong', {}, t.nom), t.cache && el('small', {}, 'Talent caché'),
        el('p', {}, t.description),
      ))),
  );
}

function noeudEvolution(noeud, courant) {
  const lien = el('a', {
    class: 'evo-pokemon', href: `pokemon.html?id=${noeud.id}`,
    'aria-current': noeud.id === courant ? 'true' : null,
  },
    el('img', { src: image(noeud.id), alt: '', width: 84, height: 84, loading: 'lazy' }),
    noeud.nom,
  );
  if (!noeud.suites.length) return [lien];
  return [
    lien,
    el('div', { class: `evo-branches${noeud.suites.length > 3 ? ' evo-nombreuses' : ''}` }, noeud.suites.map((suite) =>
      el('div', { class: 'evo-branche' },
        el('span', { class: 'evo-fleche' }, suite.condition),
        noeudEvolution(suite, courant),
      ))),
  ];
}

function blocEvolution(pokemon) {
  if (!pokemon.evolution.suites.length) {
    return bloc('Évolution', el('p', {}, `${pokemon.nom} n'évolue pas.`));
  }
  return bloc('Évolution', el('div', { class: 'evolution' }, noeudEvolution(pokemon.evolution, pokemon.id)), true);
}

function blocCapacites(pokemon, capacites, nomsTypes) {
  if (!pokemon.capacites.length) return null;
  const cellule = (valeur) => el('td', { class: 'nombre' }, valeur === null ? '—' : String(valeur));
  return bloc('Capacités apprises en montant de niveau',
    el('div', { class: 'tableau-defilant', tabindex: '0', role: 'region', 'aria-label': 'Tableau des capacités' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', { class: 'nombre' }, 'Niveau'), el('th', {}, 'Capacité'), el('th', {}, 'Type'), el('th', {}, 'Catégorie'),
          el('th', { class: 'nombre' }, 'Puissance'), el('th', { class: 'nombre' }, 'Précision'), el('th', { class: 'nombre' }, 'PP'),
        )),
        el('tbody', {}, pokemon.capacites.map(([idCapacite, niveau]) => {
          const c = capacites[idCapacite];
          return el('tr', {},
            el('td', { class: 'nombre' }, niveau <= 1 ? 'Départ' : String(niveau)),
            el('td', {}, el('strong', {}, c.nom)),
            el('td', {}, badgeType(c.type, nomsTypes)),
            el('td', {}, c.classe),
            cellule(c.puissance), cellule(c.precision), cellule(c.pp),
          );
        })),
      ),
    ),
    true,
  );
}

function afficher(pokemon, index, referentiel, capacites) {
  const nomsTypes = Object.fromEntries(referentiel.types.map((t) => [t.cle, t.nom]));
  const position = index.findIndex((p) => p.id === pokemon.id);
  const precedent = index[position - 1];
  const suivant = index[position + 1];
  const generation = referentiel.generations.find((g) => g.id === pokemon.gen);
  const couleur = COULEURS_TYPES[pokemon.types[0]];

  document.title = `${pokemon.nom} (${numero(pokemon.id)}) — PokéRef`;

  const mesure = (titre, valeur) => el('div', {}, el('dt', {}, titre), el('dd', {}, valeur));

  conteneur.style.setProperty('--c', couleur);
  conteneur.replaceChildren(
    el('nav', { class: 'fil', 'aria-label': 'Navigation entre les Pokémon' },
      el('a', { class: 'bouton', href: 'index.html', id: 'retour' }, '← Pokédex'),
      el('div', { class: 'voisins' },
        precedent && el('a', { class: 'bouton', href: `pokemon.html?id=${precedent.id}`, rel: 'prev' }, `← ${precedent.nom}`),
        suivant && el('a', { class: 'bouton', href: `pokemon.html?id=${suivant.id}`, rel: 'next' }, `${suivant.nom} →`),
      ),
    ),
    el('header', { class: 'fiche-tete' },
      el('div', { class: 'fiche-visuel' },
        el('img', { src: image(pokemon.id), alt: `Illustration de ${pokemon.nom}`, width: 320, height: 320 })),
      el('div', {},
        el('p', { class: 'fiche-numero' }, numero(pokemon.id), CATEGORIES[pokemon.cat] ? ` · ${CATEGORIES[pokemon.cat]}` : ''),
        el('div', { class: 'fiche-titre' },
          el('h1', {}, pokemon.nom),
          boutonFavori(pokemon.id, pokemon.nom, lireFavoris().has(pokemon.id)),
        ),
        el('p', { class: 'fiche-genre' }, pokemon.genre),
        el('div', { class: 'types' }, pokemon.types.map((t) => badgeType(t, nomsTypes))),
        pokemon.descriptions[0] && el('p', { class: 'fiche-description' }, pokemon.descriptions[0]),
        el('dl', { class: 'mesures' },
          mesure('Taille', `${decimal(pokemon.taille)} m`),
          mesure('Poids', `${decimal(pokemon.poids)} kg`),
          mesure('Génération', `${generation.id} · ${generation.region}`),
        ),
      ),
    ),
    el('div', { class: 'blocs' },
      blocStats(pokemon),
      blocSensibilites(pokemon, nomsTypes),
      blocEvolution(pokemon),
      blocTalents(pokemon),
      pokemon.descriptions.length > 1 && bloc('Le savais-tu ?',
        el('ul', { class: 'talents' }, pokemon.descriptions.slice(1).map((d) => el('li', {}, d)))),
      blocCapacites(pokemon, capacites, nomsTypes),
    ),
  );

  // Revenir à la liste telle qu'on l'a quittée (filtres, page) si on en vient.
  if (document.referrer && new URL(document.referrer).pathname.replace(/index\.html$/, '') === new URL('index.html', location.href).pathname.replace(/index\.html$/, '')) {
    document.getElementById('retour').href = document.referrer;
  }

  // Flèches gauche / droite du clavier pour passer d'un Pokémon à l'autre.
  document.addEventListener('keydown', (evenement) => {
    if (evenement.target.closest('input, select, textarea, [tabindex]') || evenement.metaKey || evenement.ctrlKey || evenement.altKey) return;
    if (evenement.key === 'ArrowLeft' && precedent) location.href = `pokemon.html?id=${precedent.id}`;
    if (evenement.key === 'ArrowRight' && suivant) location.href = `pokemon.html?id=${suivant.id}`;
  });
}

try {
  if (!Number.isInteger(id) || id < 1) throw new Error('Identifiant de Pokémon invalide');
  const [pokemon, index, referentiel, capacites] = await Promise.all([
    charger(`data/pokemon/${id}.json`),
    charger('data/index.json'),
    charger('data/types.json'),
    charger('data/capacites.json'),
  ]);
  afficher(pokemon, index, referentiel, capacites);
} catch (erreur) {
  console.error(erreur);
  conteneur.replaceChildren(
    el('div', { class: 'vide', role: 'alert' },
      el('strong', {}, 'Ce Pokémon est introuvable'),
      'Il s\'est peut-être caché dans les hautes herbes…',
      el('br'),
      el('a', { class: 'bouton', href: 'index.html' }, 'Retour au Pokédex'),
    ),
  );
}
