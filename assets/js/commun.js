// Outils partagés par toutes les pages.

// À incrémenter après une régénération des données : invalide le cache HTTP des JSON.
// Les données personnelles (favoris, collection) ont leur propre version de format,
// pour ne pas être perdues à chaque régénération.
export const VERSION = '1';

export const COULEURS_TYPES = {
  normal: '#8f8f7a', fire: '#ee7b2e', water: '#4f8fe8', electric: '#e6b800',
  grass: '#5cab3e', ice: '#5cc0c0', fighting: '#c03a30', poison: '#9f449f',
  ground: '#c9a04a', flying: '#8f7ee6', psychic: '#f0457c', bug: '#99a81e',
  rock: '#a8923a', ghost: '#6b5494', dragon: '#6a3df0', dark: '#6b574a',
  steel: '#8f8fae', fairy: '#e07fa6',
};

export const CATEGORIES = {
  legendaire: 'Légendaire',
  fabuleux: 'Fabuleux',
  bebe: 'Bébé',
};

export const NOMS_STATS = {
  pv: 'PV', atq: 'Attaque', def: 'Défense', atqSpe: 'Atq. Spé.', defSpe: 'Déf. Spé.', vit: 'Vitesse',
};

const memoire = new Map();

/** Charge un JSON statique (chemin relatif), une seule fois par page. */
export function charger(chemin) {
  if (!memoire.has(chemin)) {
    memoire.set(
      chemin,
      fetch(`${chemin}?v=${VERSION}`).then((reponse) => {
        if (!reponse.ok) throw new Error(`Impossible de charger ${chemin} (${reponse.status})`);
        return reponse.json();
      }),
    );
  }
  return memoire.get(chemin);
}

export const numero = (id) => '#' + String(id).padStart(4, '0');
export const image = (id) => `assets/img/pokemon/${id}.webp`;
export const normaliser = (texte) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const nombre = (valeur) => valeur.toLocaleString('fr-FR');

/** Crée un élément DOM : el('a', { href: '…', class: '…' }, enfant1, 'texte', …). */
export function el(balise, attributs = {}, ...enfants) {
  const noeud = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle === 'style') noeud.style.cssText = valeur;
    else if (cle.startsWith('on')) noeud.addEventListener(cle.slice(2), valeur);
    else noeud.setAttribute(cle, valeur === true ? '' : valeur);
  }
  noeud.append(...enfants.flat().filter((e) => e !== null && e !== undefined && e !== false));
  return noeud;
}

export function badgeType(cle, nomsTypes) {
  return el('span', { class: 'type', style: `--c:${COULEURS_TYPES[cle]}` }, nomsTypes[cle] ?? cle);
}

// ---------------------------------------------------------------- favoris (localStorage)

const CLE_FAVORIS = 'pokeref:favoris:v1';

export function lireFavoris() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLE_FAVORIS)) ?? []);
  } catch {
    return new Set();
  }
}

export function basculerFavori(id) {
  const favoris = lireFavoris();
  favoris.has(id) ? favoris.delete(id) : favoris.add(id);
  try {
    localStorage.setItem(CLE_FAVORIS, JSON.stringify([...favoris]));
  } catch {
    // Stockage indisponible (navigation privée…) : le favori ne sera pas mémorisé.
  }
  return favoris.has(id);
}

export function boutonFavori(id, nom, actif) {
  const bouton = el('button', {
    class: 'favori',
    type: 'button',
    'aria-pressed': String(actif),
    'aria-label': `Ajouter ${nom} aux favoris`,
    title: 'Favori',
    onclick: () => {
      const etat = basculerFavori(id);
      bouton.setAttribute('aria-pressed', String(etat));
      bouton.textContent = etat ? '♥' : '♡';
      bouton.dispatchEvent(new CustomEvent('favori', { bubbles: true }));
    },
  }, actif ? '♥' : '♡');
  return bouton;
}

/** Carte d'un Pokémon pour les grilles (liste, articles). */
export function cartePokemon(pokemon, nomsTypes, favoris) {
  return el('li', { class: 'carte', style: `--c:${COULEURS_TYPES[pokemon.types[0]]}` },
    CATEGORIES[pokemon.cat] && el('span', { class: 'badge-cat' }, CATEGORIES[pokemon.cat]),
    favoris && boutonFavori(pokemon.id, pokemon.nom, favoris.has(pokemon.id)),
    el('a', { href: `pokemon.html?id=${pokemon.id}` },
      el('span', { class: 'carte-visuel' },
        el('img', { src: image(pokemon.id), alt: '', width: 320, height: 320, loading: 'lazy', decoding: 'async' }),
      ),
      el('span', { class: 'carte-numero' }, numero(pokemon.id)),
      el('span', { class: 'carte-nom' }, pokemon.nom),
      el('span', { class: 'types' }, pokemon.types.map((t) => badgeType(t, nomsTypes))),
    ),
  );
}

export function carteArticle(article) {
  return el('li', {},
    el('article', { class: 'carte-article', style: `--c:${article.couleur}` },
      el('a', { href: `article.html?slug=${article.slug}` },
        el('span', { class: 'carte-article-visuel' },
          el('img', { src: image(article.vedette), alt: '', width: 320, height: 320, loading: 'lazy' }),
        ),
        el('span', { class: 'carte-article-corps' },
          el('span', { class: 'etiquette' }, article.categorie),
          el('h3', {}, article.titre),
          el('p', {}, article.resume),
        ),
      ),
    ),
  );
}

export async function nomsDesTypes() {
  const { types } = await charger('data/types.json');
  return Object.fromEntries(types.map((t) => [t.cle, t.nom]));
}

export function afficherErreur(conteneur, erreur) {
  console.error(erreur);
  conteneur.replaceChildren(
    el('div', { class: 'vide', role: 'alert' },
      el('strong', {}, 'Oups, quelque chose s\'est mal passé'),
      'Les données n\'ont pas pu être chargées. Vérifie ta connexion puis réessaie.',
      el('br'),
      el('a', { class: 'bouton', href: '' }, 'Réessayer'),
    ),
  );
}

/**
 * Affiche une pagination dans `nav` : première, dernière et voisines de la page courante.
 * `surChangement(page)` est appelé au clic.
 */
export function pagination(nav, page, pages, surChangement) {
  if (pages <= 1) return nav.replaceChildren();
  const bouton = (libelle, cible, options = {}) => el('button', {
    type: 'button',
    disabled: cible < 1 || cible > pages,
    'aria-current': options.courant ? 'page' : null,
    'aria-label': options.aria ?? `Page ${cible}`,
    onclick: () => surChangement(cible),
  }, libelle);

  const numeros = [...new Set([1, pages, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const elements = [bouton('←', page - 1, { aria: 'Page précédente' })];
  numeros.forEach((n, i) => {
    if (i && n - numeros[i - 1] > 1) elements.push(el('span', { 'aria-hidden': 'true' }, '…'));
    elements.push(bouton(String(n), n, { courant: n === page }));
  });
  elements.push(bouton('→', page + 1, { aria: 'Page suivante' }));
  nav.replaceChildren(...elements);
}
