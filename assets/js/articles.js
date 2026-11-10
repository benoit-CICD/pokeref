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

// ---------------------------------------------------------------- frise des jeux

const versDate = (iso) => new Date(`${iso}T00:00:00`);
const dateLongue = (iso) => versDate(iso)
  .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  .replace(/^1 /, '1er ');

/** Écart entre la sortie japonaise et la sortie européenne, en clair. */
function ecart(japon, europe) {
  const [a, b] = [versDate(japon), versDate(europe)];
  let mois = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) mois--;
  if (mois < 1) {
    const jours = Math.round((b - a) / 86400000);
    return `${jours} jour${jours > 1 ? 's' : ''} après le Japon`;
  }
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const morceaux = [ans && `${ans} an${ans > 1 ? 's' : ''}`, reste && `${reste} mois`].filter(Boolean);
  return `${morceaux.join(' et ')} après le Japon`;
}

function datesDuJeu(jeu) {
  const ligne = (lieu, valeur, precision) => el('div', {},
    el('dt', {}, lieu), el('dd', {}, valeur, precision && el('small', {}, precision)));
  if (jeu.japon && jeu.japon === jeu.europe) return [ligne('Monde entier', dateLongue(jeu.japon), 'même jour partout')];
  return [
    jeu.japon && ligne('Japon', dateLongue(jeu.japon)),
    jeu.europe
      ? ligne('Europe', dateLongue(jeu.europe), jeu.japon && ecart(jeu.japon, jeu.europe))
      : ligne('Europe', 'Jamais sorti'),
  ];
}

function rendreFrise(bloc) {
  return el('div', { class: 'frise' }, bloc.generations.map((g) => {
    const annees = g.jeux.flatMap((j) => [j.japon, j.europe]).filter(Boolean).map((d) => Number(d.slice(0, 4)));
    const [debut, fin] = [Math.min(...annees), Math.max(...annees)];
    return el('section', { class: 'frise-generation' },
      el('header', { class: 'frise-tete' },
        g.vedette && el('img', { src: image(g.vedette), alt: '', width: 320, height: 320, loading: 'lazy' }),
        el('div', {},
          el('h3', {}, `Génération ${g.numero} · ${g.region}`),
          el('p', { class: 'frise-annees' }, debut === fin ? String(debut) : `${debut} – ${fin}`),
          el('p', {}, g.resume),
        ),
      ),
      el('ol', { class: 'frise-jeux' }, g.jeux.map((jeu) =>
        el('li', { class: `frise-jeu${jeu.genre === 'Remake' ? ' frise-remake' : ''}` },
          el('div', { class: 'frise-jeu-tete' },
            el('strong', {}, jeu.nom),
            el('span', { class: 'frise-genre' }, jeu.genre),
          ),
          el('p', { class: 'frise-console' }, jeu.console),
          el('dl', { class: 'frise-dates' }, datesDuJeu(jeu)),
          jeu.note && el('p', { class: 'frise-note' }, jeu.note),
        ))),
    );
  }));
}

function rendreBloc(bloc, index, nomsTypes) {
  switch (bloc.t) {
    case 'frise': return rendreFrise(bloc);
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
