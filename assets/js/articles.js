// Articles : liste (articles.html) et lecture (article.html?slug=…).
// Le contenu vit dans data/articles.json, sous forme de blocs simples.

import { charger, el, image, carteArticle, cartePokemon, nomsDesTypes, afficherErreur } from './commun.js';

const liste = document.getElementById('liste-articles');
const lecture = document.getElementById('article');

async function afficherListe() {
  const articles = await charger('data/articles.json');
  const categories = [...new Set(articles.map((a) => a.categorie))];
  let choisie = new URLSearchParams(location.search).get('categorie') ?? '';
  const puces = document.getElementById('filtre-articles');

  const rendre = () => {
    puces.replaceChildren(...['', ...categories].map((c) =>
      el('button', {
        type: 'button', class: 'puce', 'aria-pressed': String(c === choisie),
        onclick: () => {
          choisie = c;
          history.replaceState(null, '', c ? `?categorie=${encodeURIComponent(c)}` : location.pathname);
          rendre();
        },
      }, c || 'Tout')));
    liste.replaceChildren(...articles.filter((a) => !choisie || a.categorie === choisie).map(carteArticle));
  };
  rendre();
}

function rendreBloc(bloc, index, nomsTypes) {
  switch (bloc.t) {
    case 'h2': return el('h2', {}, bloc.texte);
    case 'liste': return el('ul', {}, bloc.elements.map((e) => el('li', {}, e)));
    case 'encart': return el('p', { class: 'encart' }, bloc.texte);
    case 'pokemon':
      return el('ul', { class: 'grille' },
        bloc.ids.map((id) => index.find((p) => p.id === id)).filter(Boolean).map((p) => cartePokemon(p, nomsTypes)));
    default: return el('p', {}, bloc.texte);
  }
}

async function afficherArticle() {
  const slug = new URLSearchParams(location.search).get('slug');
  const [articles, index, nomsTypes] = await Promise.all([
    charger('data/articles.json'), charger('data/index.json'), nomsDesTypes(),
  ]);
  const article = articles.find((a) => a.slug === slug);
  if (!article) {
    lecture.replaceChildren(
      el('div', { class: 'vide' },
        el('strong', {}, 'Article introuvable'),
        el('a', { class: 'bouton', href: 'articles.html' }, 'Voir tous les articles')),
    );
    return;
  }
  document.title = `${article.titre} — PokéRef`;
  const autres = articles.filter((a) => a !== article).slice(0, 3);

  lecture.replaceChildren(
    el('nav', { class: 'fil', 'aria-label': 'Fil d\'Ariane' }, el('a', { class: 'bouton', href: 'articles.html' }, '← Articles')),
    el('article', {},
      el('header', { class: 'article-tete', style: `--c:${article.couleur}` },
        el('div', {},
          el('span', { class: 'etiquette' }, article.categorie),
          el('h1', {}, article.titre),
          el('p', {}, article.resume),
        ),
        el('img', { src: image(article.vedette), alt: '', width: 320, height: 320 }),
      ),
      el('div', { class: 'article-corps' }, article.blocs.map((b) => rendreBloc(b, index, nomsTypes))),
    ),
    el('section', { class: 'section', 'aria-labelledby': 'a-lire' },
      el('div', { class: 'section-titre' }, el('h2', { id: 'a-lire' }, 'À lire aussi')),
      el('ul', { class: 'grille-articles' }, autres.map(carteArticle)),
    ),
  );
}

try {
  await (liste ? afficherListe() : afficherArticle());
} catch (erreur) {
  afficherErreur(liste ?? lecture, erreur);
}
