// Page d'accueil : liste paginée des Pokémon, recherche, filtres et tri.
// Tout se fait en local sur data/index.json : aucun appel d'API pendant la navigation.

import {
  charger, el, normaliser, nombre, cartePokemon, carteArticle, lireFavoris, pagination,
  COULEURS_TYPES, CATEGORIES, afficherErreur,
} from './commun.js';

const PAR_PAGE = 24;
const TYPES_MAX = 2; // un Pokémon a au plus deux types

const $ = (id) => document.getElementById(id);
const grille = $('grille');
const champRecherche = $('recherche');

// L'état de la liste vit dans l'URL : on peut partager un lien ou revenir en arrière sans rien perdre.
const etat = lireUrl();
let pokemons = [];
let nomsTypes = {};
let favoris = lireFavoris();

function lireUrl() {
  const p = new URLSearchParams(location.search);
  return {
    q: p.get('q') ?? '',
    types: (p.get('type') ?? '').split(',').filter((t) => t in COULEURS_TYPES).slice(0, TYPES_MAX),
    gen: Number(p.get('gen')) || 0,
    cat: p.get('cat') ?? '',
    tri: p.get('tri') ?? 'numero',
    page: Math.max(1, Number(p.get('page')) || 1),
  };
}

function ecrireUrl() {
  const p = new URLSearchParams();
  if (etat.q) p.set('q', etat.q);
  if (etat.types.length) p.set('type', etat.types.join(','));
  if (etat.gen) p.set('gen', etat.gen);
  if (etat.cat) p.set('cat', etat.cat);
  if (etat.tri !== 'numero') p.set('tri', etat.tri);
  if (etat.page > 1) p.set('page', etat.page);
  const requete = p.toString();
  history.replaceState(null, '', requete ? `?${requete}` : location.pathname);
}

function filtrer() {
  const q = normaliser(etat.q);
  const qNumero = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
  const resultat = pokemons.filter((p) => {
    if (qNumero !== null ? p.id !== qNumero : q && !p.recherche.includes(q)) return false;
    if (!etat.types.every((t) => p.types.includes(t))) return false;
    if (etat.gen && p.gen !== etat.gen) return false;
    if (etat.cat === 'favoris') return favoris.has(p.id);
    if (etat.cat && p.cat !== etat.cat) return false;
    return true;
  });
  if (etat.tri === 'nom') resultat.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  else if (etat.tri === 'puissance') resultat.sort((a, b) => b.total - a.total || a.id - b.id);
  // Quand on cherche par nom, ceux qui commencent par le texte saisi passent devant.
  if (q && qNumero === null && etat.tri === 'numero') {
    resultat.sort((a, b) => b.recherche.startsWith(q) - a.recherche.startsWith(q) || a.id - b.id);
  }
  return resultat;
}

function afficher({ defiler = false } = {}) {
  const resultat = filtrer();
  const pages = Math.max(1, Math.ceil(resultat.length / PAR_PAGE));
  etat.page = Math.min(etat.page, pages);
  ecrireUrl();

  const debut = (etat.page - 1) * PAR_PAGE;
  const tranche = resultat.slice(debut, debut + PAR_PAGE);

  $('compteur').textContent = resultat.length
    ? `${nombre(resultat.length)} Pokémon${pages > 1 ? ` · page ${etat.page} sur ${pages}` : ''}`
    : 'Aucun Pokémon';
  $('effacer').hidden = !(etat.q || etat.types.length || etat.gen || etat.cat);

  if (tranche.length) {
    grille.replaceChildren(...tranche.map((p) => cartePokemon(p, nomsTypes, favoris)));
  } else {
    grille.replaceChildren(
      el('li', { class: 'vide', style: 'grid-column:1/-1' },
        el('strong', {}, etat.cat === 'favoris' ? 'Pas encore de favori' : 'Aucun Pokémon trouvé'),
        etat.cat === 'favoris'
          ? 'Touche le cœur d\'un Pokémon pour l\'ajouter ici.'
          : 'Essaie un autre nom ou enlève un filtre.',
      ),
    );
  }
  pagination($('pagination'), etat.page, pages, (page) => { etat.page = page; afficher({ defiler: true }); });
  majPuces();
  if (defiler) $('resultats').scrollIntoView({ block: 'start' });
}

// ---------------------------------------------------------------- filtres

function puce(groupe, valeur, contenu, attributs = {}) {
  return el('button', { type: 'button', class: 'puce', 'data-groupe': groupe, 'data-valeur': valeur, 'aria-pressed': 'false', ...attributs }, contenu);
}

function construireFiltres(referentiel) {
  $('filtre-types').append(...referentiel.types.map((t) =>
    puce('type', t.cle, t.nom, { class: 'puce puce-type', style: `--c:${COULEURS_TYPES[t.cle]}` })));
  $('filtre-generations').append(...referentiel.generations.map((g) =>
    puce('gen', g.id, [`${g.id} `, el('small', {}, g.region)], { 'aria-label': `${g.nom}, ${g.region}` })));
  $('filtre-categories').append(
    ...Object.entries(CATEGORIES).map(([cle, nom]) => puce('cat', cle, `${nom}s`)),
    puce('cat', 'favoris', '♥ Mes favoris'),
  );

  document.querySelector('.filtres').addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('.puce');
    if (!bouton) return;
    const { groupe, valeur } = bouton.dataset;
    if (groupe === 'type') {
      if (etat.types.includes(valeur)) etat.types = etat.types.filter((t) => t !== valeur);
      else etat.types = [...etat.types, valeur].slice(-TYPES_MAX);
    } else if (groupe === 'gen') {
      etat.gen = etat.gen === Number(valeur) ? 0 : Number(valeur);
    } else {
      etat.cat = etat.cat === valeur ? '' : valeur;
    }
    etat.page = 1;
    afficher();
  });
}

function majPuces() {
  for (const bouton of document.querySelectorAll('.puce')) {
    const { groupe, valeur } = bouton.dataset;
    const actif = groupe === 'type' ? etat.types.includes(valeur)
      : groupe === 'gen' ? etat.gen === Number(valeur)
      : etat.cat === valeur;
    bouton.setAttribute('aria-pressed', String(actif));
  }
}

// ---------------------------------------------------------------- événements

let minuteur;
champRecherche.addEventListener('input', () => {
  clearTimeout(minuteur);
  minuteur = setTimeout(() => {
    etat.q = champRecherche.value.trim();
    etat.page = 1;
    afficher();
  }, 120);
});
$('formulaire-recherche').addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  champRecherche.blur();
  $('resultats').scrollIntoView({ block: 'start' });
});

$('tri').addEventListener('change', (evenement) => {
  etat.tri = evenement.target.value;
  etat.page = 1;
  afficher();
});

$('effacer').addEventListener('click', () => {
  Object.assign(etat, { q: '', types: [], gen: 0, cat: '', page: 1 });
  champRecherche.value = '';
  afficher();
});

$('hasard').addEventListener('click', () => {
  if (!pokemons.length) return;
  const choisi = pokemons[Math.floor(Math.random() * pokemons.length)];
  location.href = `pokemon.html?id=${choisi.id}`;
});

grille.addEventListener('favori', () => {
  favoris = lireFavoris();
  if (etat.cat === 'favoris') afficher();
});

// ---------------------------------------------------------------- démarrage

try {
  const [index, referentiel] = await Promise.all([charger('data/index.json'), charger('data/types.json')]);
  pokemons = index.map((p) => ({ ...p, recherche: normaliser(p.nom) }));
  nomsTypes = Object.fromEntries(referentiel.types.map((t) => [t.cle, t.nom]));
  champRecherche.value = etat.q;
  $('tri').value = etat.tri;
  construireFiltres(referentiel);
  afficher();
} catch (erreur) {
  afficherErreur(grille, erreur);
}

charger('data/articles.json')
  .then((articles) => $('articles').append(...articles.slice(0, 3).map(carteArticle)))
  .catch(console.error);
