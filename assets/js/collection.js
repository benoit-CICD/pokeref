// Collection de cartes : extensions, recherche et cartes possédées.
//
//   collection.html                  → liste des extensions
//   collection.html?set=base1        → cartes d'une extension
//   collection.html?q=pikachu        → recherche d'une carte par nom
//   collection.html?vue=mes-cartes   → cartes possédées
//
// Les cartes viennent de l'API TCGdex (https://tcgdex.dev), appelée en direct depuis le navigateur,
// avec un petit cache. La collection, elle, reste dans le localStorage de l'appareil.

import { el, nombre, normaliser, pagination } from './commun.js';

const API = 'https://api.tcgdex.net/v2/fr';
const CLE_COLLECTION = 'pokeref:collection:v1';
const PREFIXE_CACHE = 'pokeref:tcgdex:v1:';
const DUREE_CACHE = 24 * 60 * 60 * 1000; // 24 h
const PAR_PAGE = 30;

const $ = (id) => document.getElementById(id);
const vue = $('vue');
const parametres = new URLSearchParams(location.search);

// ---------------------------------------------------------------- API + cache

/** Interroge TCGdex. `durable` : cache localStorage 24 h ; sinon cache limité à l'onglet. */
async function api(chemin, { durable = false } = {}) {
  const stockage = durable ? localStorage : sessionStorage;
  const cle = PREFIXE_CACHE + chemin;
  try {
    const enCache = JSON.parse(stockage.getItem(cle));
    if (enCache && Date.now() - enCache.t < DUREE_CACHE) return enCache.d;
  } catch { /* cache illisible : on recharge */ }

  const reponse = await fetch(`${API}/${chemin}`);
  if (!reponse.ok) throw new Error(`TCGdex a répondu ${reponse.status}`);
  const donnees = await reponse.json();
  try {
    stockage.setItem(cle, JSON.stringify({ t: Date.now(), d: donnees }));
  } catch { /* stockage plein ou indisponible : tant pis pour le cache */ }
  return donnees;
}

// ---------------------------------------------------------------- collection (localStorage)

// Format : { "base1-4": { n: "Dracaufeu", i: "https://…/base1/4", s: "base1", l: "4" }, … }
// On garde le nom et l'image pour afficher « Mes cartes » sans rappeler l'API.
function lireCollection() {
  try {
    const donnees = JSON.parse(localStorage.getItem(CLE_COLLECTION));
    return donnees && typeof donnees === 'object' && !Array.isArray(donnees) ? donnees : {};
  } catch {
    return {};
  }
}

function enregistrerCollection() {
  try {
    localStorage.setItem(CLE_COLLECTION, JSON.stringify(collection));
    return true;
  } catch {
    annoncer('Impossible d\'enregistrer sur cet appareil (stockage plein ou navigation privée).');
    return false;
  }
}

let collection = lireCollection();

function majTotal() {
  const total = Object.keys(collection).length;
  $('total-cartes').textContent = total ? nombre(total) : '';
}

function annoncer(texte) {
  const message = $('message');
  message.textContent = texte;
  message.hidden = false;
}

/** Ne garde que des entrées bien formées (sert à l'import : le fichier n'est pas de confiance). */
function nettoyerCartes(cartes) {
  const propres = {};
  if (!cartes || typeof cartes !== 'object') return propres;
  const texte = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  for (const [id, c] of Object.entries(cartes)) {
    if (!/^[\w.!?%+-]{1,60}$/.test(id) || !c || typeof c !== 'object') continue;
    const image = texte(c.i, 200);
    propres[id] = {
      n: texte(c.n, 120) || id,
      i: image.startsWith('https://assets.tcgdex.net/') ? image : '',
      s: texte(c.s, 40),
      l: texte(c.l, 20),
    };
  }
  return propres;
}

// ---------------------------------------------------------------- rendu des cartes

function tuileCarte(carte, idExtension, surBascule) {
  const possedee = () => carte.id in collection;
  const etat = el('span', { class: 'etat', 'aria-hidden': 'true' }, possedee() ? '✓' : '+');
  const bouton = el('button', {
    type: 'button', class: 'carte-tcg', 'aria-pressed': String(possedee()),
    'aria-label': `${carte.name}, carte n° ${carte.localId}`,
    title: 'Touche pour ajouter ou retirer de ta collection',
    onclick: () => {
      if (possedee()) delete collection[carte.id];
      else collection[carte.id] = { n: carte.name, i: carte.image ?? '', s: idExtension, l: carte.localId };
      if (!enregistrerCollection()) return;
      bouton.setAttribute('aria-pressed', String(possedee()));
      etat.textContent = possedee() ? '✓' : '+';
      majTotal();
      surBascule?.();
    },
  },
    etat,
    carte.image
      ? el('img', { src: `${carte.image}/low.webp`, alt: '', width: 245, height: 337, loading: 'lazy', decoding: 'async' })
      : el('span', { class: 'sans-image' }, 'Image indisponible'),
    el('strong', {}, carte.name),
    el('small', {}, `N° ${carte.localId}`),
  );
  return el('li', {}, bouton);
}

/** Grille paginée de cartes. `cartes` : [{ id, name, localId, image?, set }] */
function afficherGrille(conteneur, cartes, { vide, surBascule, classe = '' }) {
  let page = Math.max(1, Number(parametres.get('page')) || 1);
  const rendre = (defiler = false) => {
    const pages = Math.max(1, Math.ceil(cartes.length / PAR_PAGE));
    page = Math.min(page, pages);
    const tranche = cartes.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
    conteneur.replaceChildren(
      tranche.length
        ? el('ul', { class: `grille-cartes ${classe}` }, tranche.map((c) => tuileCarte(c, c.set, surBascule)))
        : el('div', { class: 'vide' }, el('strong', {}, vide[0]), vide[1]),
    );
    pagination($('pagination'), page, pages, (cible) => {
      page = cible;
      parametres.set('page', page);
      history.replaceState(null, '', `?${parametres}`);
      rendre(true);
    });
    if (defiler) conteneur.scrollIntoView({ block: 'start' });
  };
  rendre();
  return { rendre, definir: (nouvelles) => { cartes = nouvelles; page = 1; rendre(); } };
}

// ---------------------------------------------------------------- vue : extensions

async function vueExtensions() {
  $('onglet-extensions').setAttribute('aria-current', 'page');
  const extensions = (await api('sets', { durable: true })).slice().reverse(); // les plus récentes d'abord

  const possedees = {};
  for (const c of Object.values(collection)) possedees[c.s] = (possedees[c.s] ?? 0) + 1;

  const filtre = el('input', { type: 'search', placeholder: 'Filtrer les extensions…', 'aria-label': 'Filtrer les extensions par nom', class: 'champ-filtre' });
  const compteur = el('p', {});
  const liste = el('ul', { class: 'grille-extensions' });
  let page = 1;

  const rendre = (defiler = false) => {
    const q = normaliser(filtre.value);
    const visibles = extensions.filter((e) => !q || normaliser(e.name).includes(q));
    const pages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
    page = Math.min(page, pages);
    compteur.textContent = `${nombre(visibles.length)} extension${visibles.length > 1 ? 's' : ''}`;
    liste.replaceChildren(...visibles.slice((page - 1) * PAR_PAGE, page * PAR_PAGE).map((e) => {
      const total = e.cardCount?.total ?? 0;
      const nb = possedees[e.id] ?? 0;
      return el('li', {},
        el('article', { class: 'extension' },
          el('a', { href: `collection.html?set=${encodeURIComponent(e.id)}` },
            el('span', { class: 'extension-logo' },
              e.logo ? el('img', { src: `${e.logo}.webp`, alt: '', loading: 'lazy' }) : e.name.slice(0, 2).toUpperCase()),
            el('strong', {}, e.name),
            el('small', {}, `${nb} / ${total} cartes`),
            el('span', { class: 'progression', 'aria-hidden': 'true' }, el('i', { style: `--v:${total ? Math.round((nb / total) * 100) : 0}%` })),
          ),
        ),
      );
    }));
    pagination($('pagination'), page, pages, (cible) => { page = cible; rendre(true); });
    if (defiler) vue.scrollIntoView({ block: 'start' });
  };
  filtre.addEventListener('input', () => { page = 1; rendre(); });

  vue.replaceChildren(el('div', { class: 'barre-resultats' }, compteur, filtre), liste);
  rendre();
}

// ---------------------------------------------------------------- vue : une extension

async function vueExtension(id) {
  $('onglet-extensions').setAttribute('aria-current', 'page');
  const extension = await api(`sets/${encodeURIComponent(id)}`);
  const cartes = extension.cards.map((c) => ({ ...c, set: extension.id }));
  document.title = `${extension.name} — Cartes — PokéRef`;

  let filtre = 'toutes';
  const compteur = el('p', {});
  const barre = el('i', {});
  const zone = el('div', {});
  const majProgression = () => {
    const nb = cartes.filter((c) => c.id in collection).length;
    compteur.textContent = `${nb} / ${cartes.length} cartes dans ta collection`;
    barre.style.setProperty('--v', `${cartes.length ? Math.round((nb / cartes.length) * 100) : 0}%`);
  };
  const filtrees = () => cartes.filter((c) =>
    filtre === 'toutes' || (filtre === 'possedees') === (c.id in collection));

  const grille = afficherGrille(zone, cartes, {
    vide: ['Aucune carte ici', 'Change de filtre pour voir les autres cartes.'],
    surBascule: majProgression,
    classe: 'manquantes-grisees',
  });

  const puces = el('div', { class: 'puces', role: 'group', 'aria-label': 'Afficher' },
    [['toutes', 'Toutes'], ['possedees', 'Je les ai'], ['manquantes', 'Il me manque']].map(([valeur, libelle]) =>
      el('button', {
        type: 'button', class: 'puce', 'aria-pressed': String(valeur === filtre),
        onclick: (evenement) => {
          filtre = valeur;
          for (const p of puces.children) p.setAttribute('aria-pressed', String(p === evenement.currentTarget));
          grille.definir(filtrees());
        },
      }, libelle)));

  vue.replaceChildren(
    el('nav', { class: 'fil', 'aria-label': 'Fil d\'Ariane' }, el('a', { class: 'bouton', href: 'collection.html' }, '← Extensions')),
    el('header', { class: 'extension-tete' },
      el('h2', {}, extension.name),
      el('p', {}, [extension.serie?.name && `Série ${extension.serie.name}`, extension.releaseDate && `sortie le ${new Date(extension.releaseDate).toLocaleDateString('fr-FR')}`].filter(Boolean).join(' · ')),
      compteur,
      el('span', { class: 'progression', 'aria-hidden': 'true' }, barre),
      puces,
    ),
    zone,
  );
  majProgression();
}

// ---------------------------------------------------------------- vue : recherche

async function vueRecherche(q) {
  $('recherche-cartes').value = q;
  document.title = `« ${q} » — Cartes — PokéRef`;
  const resultats = await api(`cards?name=${encodeURIComponent(q)}`);
  // L'identifiant d'une carte est « extension-numéro » : on en déduit l'extension.
  const cartes = resultats.map((c) => ({ ...c, set: c.id.slice(0, c.id.length - String(c.localId).length - 1) }));
  const zone = el('div', {});
  vue.replaceChildren(
    el('div', { class: 'barre-resultats' },
      el('p', {}, `${nombre(cartes.length)} carte${cartes.length > 1 ? 's' : ''} pour « ${q} »`),
      el('a', { class: 'lien-discret', href: 'collection.html' }, 'Effacer la recherche')),
    zone,
  );
  afficherGrille(zone, cartes, { vide: ['Aucune carte trouvée', 'Vérifie l\'orthographe ou essaie un autre nom.'] });
}

// ---------------------------------------------------------------- vue : mes cartes

function vueMesCartes() {
  $('onglet-collection').setAttribute('aria-current', 'page');
  const cartes = Object.entries(collection)
    .map(([id, c]) => ({ id, name: c.n, image: c.i || undefined, localId: c.l, set: c.s }))
    .sort((a, b) => a.set.localeCompare(b.set) || a.localId.localeCompare(b.localId, 'fr', { numeric: true }));
  const zone = el('div', {});
  vue.replaceChildren(
    el('div', { class: 'barre-resultats' }, el('p', {}, `${nombre(cartes.length)} carte${cartes.length > 1 ? 's' : ''} dans ta collection`)),
    zone,
  );
  afficherGrille(zone, cartes, {
    vide: ['Ta collection est vide', 'Ouvre une extension ou cherche une carte, puis touche celles que tu possèdes.'],
  });
}

// ---------------------------------------------------------------- export / import

$('exporter').addEventListener('click', () => {
  const contenu = JSON.stringify({ application: 'pokeref', format: 1, exporteLe: new Date().toISOString(), cartes: collection }, null, 2);
  const lien = el('a', {
    href: URL.createObjectURL(new Blob([contenu], { type: 'application/json' })),
    download: `pokeref-collection-${new Date().toISOString().slice(0, 10)}.json`,
  });
  lien.click();
  URL.revokeObjectURL(lien.href);
  annoncer(`Collection exportée : ${nombre(Object.keys(collection).length)} carte(s). Garde ce fichier pour la retrouver sur un autre appareil.`);
});

$('importer').addEventListener('click', () => $('fichier-import').click());
$('fichier-import').addEventListener('change', async (evenement) => {
  const fichier = evenement.target.files[0];
  evenement.target.value = '';
  if (!fichier) return;
  try {
    const donnees = JSON.parse(await fichier.text());
    if (donnees?.application !== 'pokeref' || !donnees.cartes) throw new Error('format inconnu');
    const importees = nettoyerCartes(donnees.cartes);
    const avant = Object.keys(collection).length;
    // Fusion : on ajoute les cartes du fichier sans rien retirer de la collection actuelle.
    collection = { ...collection, ...importees };
    if (!enregistrerCollection()) return;
    const ajoutees = Object.keys(collection).length - avant;
    sessionStorage.setItem('pokeref:message', `Import terminé : ${nombre(ajoutees)} nouvelle(s) carte(s) ajoutée(s) à ta collection.`);
    location.reload();
  } catch {
    annoncer('Ce fichier n\'est pas une collection PokéRef valide. Rien n\'a été modifié.');
  }
});

// ---------------------------------------------------------------- démarrage

majTotal();
const messageEnAttente = sessionStorage.getItem('pokeref:message');
if (messageEnAttente) {
  sessionStorage.removeItem('pokeref:message');
  annoncer(messageEnAttente);
}

try {
  const q = (parametres.get('q') ?? '').trim();
  if (q) await vueRecherche(q);
  else if (parametres.get('set')) await vueExtension(parametres.get('set'));
  else if (parametres.get('vue') === 'mes-cartes') vueMesCartes();
  else await vueExtensions();
} catch (erreur) {
  console.error(erreur);
  $('pagination').replaceChildren();
  vue.replaceChildren(
    el('div', { class: 'vide', role: 'alert' },
      el('strong', {}, 'Les cartes ne répondent pas'),
      'Le service de cartes est peut-être indisponible, ou cette extension n\'existe pas. Ta collection, elle, est toujours là.',
      el('br'),
      el('a', { class: 'bouton', href: 'collection.html' }, 'Retour aux extensions'),
    ),
  );
}
