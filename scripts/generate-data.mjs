#!/usr/bin/env node
// Génère les JSON statiques du site à partir de PokéAPI (https://pokeapi.co).
//
//   node scripts/generate-data.mjs            # génère tout (réutilise le cache disque)
//   node scripts/generate-data.mjs --manquants # n'écrit que les fiches absentes de data/pokemon/
//   node scripts/generate-data.mjs --frais     # ignore le cache disque et retélécharge tout
//
// Aucune dépendance : Node 18+ (fetch natif).
// Les réponses brutes sont gardées dans .cache/pokeapi/ (non versionné) pour pouvoir
// relancer le script sans réinterroger l'API.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_DATA = join(RACINE, 'data');
const DOSSIER_CACHE = join(RACINE, '.cache', 'pokeapi');
const API = 'https://pokeapi.co/api/v2';
const CONCURRENCE = 6;
const ESSAIS = 4;

const SEULEMENT_MANQUANTS = process.argv.includes('--manquants');
const SANS_CACHE = process.argv.includes('--frais');

// ---------------------------------------------------------------- utilitaires

const existe = (chemin) => access(chemin).then(() => true, () => false);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const idDepuisUrl = (url) => Number(url.replace(/\/$/, '').split('/').pop());
const fr = (liste) => liste?.find((e) => e.language.name === 'fr');
const nettoyer = (texte) => (texte ?? '').replace(/[\n\f\r­]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Récupère une ressource PokéAPI, avec cache disque et reprises sur erreur. */
async function api(chemin) {
  const fichier = join(DOSSIER_CACHE, chemin.replace(/[/?=&]/g, '_') + '.json');
  if (!SANS_CACHE && (await existe(fichier))) {
    return JSON.parse(await readFile(fichier, 'utf8'));
  }
  let derniereErreur;
  for (let essai = 1; essai <= ESSAIS; essai++) {
    try {
      const reponse = await fetch(`${API}/${chemin}`);
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const json = await reponse.json();
      await mkdir(dirname(fichier), { recursive: true });
      await writeFile(fichier, JSON.stringify(json));
      return json;
    } catch (erreur) {
      derniereErreur = erreur;
      await pause(500 * 2 ** essai);
    }
  }
  throw new Error(`Échec sur ${chemin} : ${derniereErreur.message}`);
}

/** Applique `fn` à chaque élément avec une concurrence limitée, en conservant l'ordre. */
async function enParallele(elements, fn, libelle) {
  const resultats = new Array(elements.length);
  let suivant = 0;
  let faits = 0;
  async function ouvrier() {
    while (suivant < elements.length) {
      const i = suivant++;
      resultats[i] = await fn(elements[i], i);
      faits++;
      if (libelle && (faits % 100 === 0 || faits === elements.length)) {
        process.stdout.write(`\r  ${libelle} : ${faits}/${elements.length}   `);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));
  if (libelle) process.stdout.write('\n');
  return resultats;
}

/** JSON à clés triées : sortie déterministe pour des diffs Git lisibles. */
function trier(valeur) {
  if (Array.isArray(valeur)) return valeur.map(trier);
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.keys(valeur).sort().map((c) => [c, trier(valeur[c])]));
  }
  return valeur;
}

async function ecrire(cheminRelatif, donnees, { indente = false } = {}) {
  const fichier = join(DOSSIER_DATA, cheminRelatif);
  await mkdir(dirname(fichier), { recursive: true });
  await writeFile(fichier, JSON.stringify(trier(donnees), null, indente ? 2 : 0) + '\n');
}

// ---------------------------------------------------------------- référentiels

const GENERATIONS = [
  { id: 1, nom: 'Génération 1', region: 'Kanto' },
  { id: 2, nom: 'Génération 2', region: 'Johto' },
  { id: 3, nom: 'Génération 3', region: 'Hoenn' },
  { id: 4, nom: 'Génération 4', region: 'Sinnoh' },
  { id: 5, nom: 'Génération 5', region: 'Unys' },
  { id: 6, nom: 'Génération 6', region: 'Kalos' },
  { id: 7, nom: 'Génération 7', region: 'Alola' },
  { id: 8, nom: 'Génération 8', region: 'Galar' },
  { id: 9, nom: 'Génération 9', region: 'Paldea' },
];

const CLES_STATS = { hp: 'pv', attack: 'atq', defense: 'def', 'special-attack': 'atqSpe', 'special-defense': 'defSpe', speed: 'vit' };
const CLASSES_CAPACITE = { physical: 'Physique', special: 'Spéciale', status: 'Statut' };

async function genererTypes() {
  const liste = (await api('type?limit=100')).results;
  const bruts = await enParallele(liste, (t) => api(`type/${idDepuisUrl(t.url)}`));
  // On écarte les pseudo-types (« ??? », Stellaire, Obscur) qui n'ont aucun Pokémon standard.
  const types = bruts.filter((t) => t.id <= 18).sort((a, b) => a.id - b.id);
  const cles = types.map((t) => t.name);

  // efficacite[attaquant][defenseur] = multiplicateur (seules les valeurs ≠ 1 sont stockées).
  const efficacite = {};
  for (const t of types) {
    const ligne = {};
    for (const d of t.damage_relations.double_damage_to) if (cles.includes(d.name)) ligne[d.name] = 2;
    for (const d of t.damage_relations.half_damage_to) if (cles.includes(d.name)) ligne[d.name] = 0.5;
    for (const d of t.damage_relations.no_damage_to) if (cles.includes(d.name)) ligne[d.name] = 0;
    efficacite[t.name] = ligne;
  }
  const sortie = {
    types: types.map((t) => ({ cle: t.name, nom: fr(t.names)?.name ?? t.name })),
    efficacite,
    generations: GENERATIONS,
  };
  await ecrire('types.json', sortie, { indente: true });
  return sortie;
}

/** Multiplicateur subi par un Pokémon (1 ou 2 types) face à chaque type attaquant. */
function calculerSensibilites(typesPokemon, referentiel) {
  const resultat = {};
  for (const { cle: attaquant } of referentiel.types) {
    let m = 1;
    for (const defenseur of typesPokemon) m *= referentiel.efficacite[attaquant][defenseur] ?? 1;
    if (m !== 1) resultat[attaquant] = m;
  }
  return resultat;
}

// ---------------------------------------------------------------- évolutions

function decrireCondition(detail, nomsObjets) {
  if (!detail) return '';
  const morceaux = [];
  const declencheur = detail.trigger?.name;
  if (detail.min_level) morceaux.push(`Niveau ${detail.min_level}`);
  if (detail.item) morceaux.push(nomsObjets.get(detail.item.name) ?? 'Objet');
  if (declencheur === 'trade') morceaux.push('Échange');
  if (detail.held_item) morceaux.push(`en tenant ${nomsObjets.get(detail.held_item.name) ?? 'un objet'}`);
  if (detail.min_happiness) morceaux.push('Bonheur');
  if (detail.min_affection) morceaux.push('Affection');
  if (detail.min_beauty) morceaux.push('Beauté');
  if (detail.known_move || detail.known_move_type) morceaux.push('Capacité spéciale');
  if (detail.location) morceaux.push('Lieu spécial');
  if (detail.time_of_day === 'day') morceaux.push('de jour');
  if (detail.time_of_day === 'night') morceaux.push('de nuit');
  if (detail.gender === 1) morceaux.push('femelle');
  if (detail.gender === 2) morceaux.push('mâle');
  if (!morceaux.length) morceaux.push(declencheur === 'level-up' ? 'Gain de niveau' : 'Condition spéciale');
  return morceaux.join(' · ');
}

function aplatirChaine(noeud, nomsEspeces, nomsObjets) {
  const id = idDepuisUrl(noeud.species.url);
  return {
    id,
    nom: nomsEspeces.get(id) ?? noeud.species.name,
    condition: decrireCondition(noeud.evolution_details?.[0], nomsObjets),
    suites: noeud.evolves_to
      .map((n) => aplatirChaine(n, nomsEspeces, nomsObjets))
      .filter((n) => nomsEspeces.has(n.id)),
  };
}

function objetsDeLaChaine(noeud, ensemble) {
  for (const d of noeud.evolution_details ?? []) {
    if (d.item) ensemble.add(d.item.name);
    if (d.held_item) ensemble.add(d.held_item.name);
  }
  noeud.evolves_to.forEach((n) => objetsDeLaChaine(n, ensemble));
}

// ---------------------------------------------------------------- programme principal

async function main() {
  console.log('Génération des données Pokémon depuis PokéAPI…');
  const referentiel = await genererTypes();

  const listeEspeces = (await api('pokemon-species?limit=5000')).results;
  const ids = listeEspeces.map((e) => idDepuisUrl(e.url)).sort((a, b) => a - b);
  console.log(`  ${ids.length} espèces à traiter`);

  const especes = await enParallele(ids, (id) => api(`pokemon-species/${id}`), 'espèces');
  // La forme par défaut d'une espèce n'a pas toujours le même identifiant que l'espèce.
  const pokemons = await enParallele(
    especes,
    (e) => api(`pokemon/${idDepuisUrl(e.varieties.find((v) => v.is_default).pokemon.url)}`),
    'pokémon',
  );

  const nomsEspeces = new Map(especes.map((e) => [e.id, fr(e.names)?.name ?? e.name]));

  // Chaînes d'évolution + objets qu'elles utilisent
  const idsChaines = [...new Set(especes.map((e) => idDepuisUrl(e.evolution_chain.url)))];
  const chaines = new Map(
    (await enParallele(idsChaines, (id) => api(`evolution-chain/${id}`), 'évolutions')).map((c) => [c.id, c]),
  );
  const clesObjets = new Set();
  chaines.forEach((c) => objetsDeLaChaine(c.chain, clesObjets));
  const nomsObjets = new Map(
    (await enParallele([...clesObjets], (cle) => api(`item/${cle}`), 'objets')).map((o) => [o.name, fr(o.names)?.name ?? o.name]),
  );

  // Talents
  const clesTalents = [...new Set(pokemons.flatMap((p) => p.abilities.map((a) => a.ability.name)))].sort();
  const talents = new Map(
    (await enParallele(clesTalents, (cle) => api(`ability/${cle}`), 'talents')).map((t) => [
      t.name,
      {
        nom: fr(t.names)?.name ?? t.name,
        description: nettoyer(t.flavor_text_entries.filter((f) => f.language.name === 'fr').pop()?.flavor_text),
      },
    ]),
  );

  // Capacités : pour chaque Pokémon, celles apprises par montée de niveau dans le jeu le plus récent.
  const capacitesParPokemon = pokemons.map((p) => {
    const parNiveau = [];
    let groupeRecent = 0;
    for (const m of p.moves) {
      for (const d of m.version_group_details) {
        if (d.move_learn_method.name !== 'level-up') continue;
        const groupe = idDepuisUrl(d.version_group.url);
        groupeRecent = Math.max(groupeRecent, groupe);
        parNiveau.push({ id: idDepuisUrl(m.move.url), niveau: d.level_learned_at, groupe });
      }
    }
    return parNiveau
      .filter((c) => c.groupe === groupeRecent)
      .sort((a, b) => a.niveau - b.niveau || a.id - b.id)
      .map((c) => [c.id, c.niveau]);
  });
  const idsCapacites = [...new Set(capacitesParPokemon.flat().map(([id]) => id))].sort((a, b) => a - b);
  const capacitesBrutes = await enParallele(idsCapacites, (id) => api(`move/${id}`), 'capacités');
  const capacites = {};
  for (const c of capacitesBrutes) {
    capacites[c.id] = {
      nom: fr(c.names)?.name ?? c.name,
      type: c.type.name,
      classe: CLASSES_CAPACITE[c.damage_class?.name] ?? '',
      puissance: c.power,
      precision: c.accuracy,
      pp: c.pp,
    };
  }
  await ecrire('capacites.json', capacites);

  // Fiches détaillées + index
  const index = [];
  let ecrites = 0;
  for (let i = 0; i < especes.length; i++) {
    const e = especes[i];
    const p = pokemons[i];
    const types = p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
    const stats = Object.fromEntries(p.stats.map((s) => [CLES_STATS[s.stat.name], s.base_stat]));
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    const generation = idDepuisUrl(e.generation.url);
    const categorie = e.is_mythical ? 'fabuleux' : e.is_legendary ? 'legendaire' : e.is_baby ? 'bebe' : 'standard';
    const nom = nomsEspeces.get(e.id);

    index.push({ id: e.id, nom, types, gen: generation, cat: categorie, total });

    const fichier = join('pokemon', `${e.id}.json`);
    if (SEULEMENT_MANQUANTS && (await existe(join(DOSSIER_DATA, fichier)))) continue;

    // Descriptions françaises : on garde les plus récentes, sans doublon.
    const descriptions = [];
    for (const f of e.flavor_text_entries.filter((x) => x.language.name === 'fr').reverse()) {
      const texte = nettoyer(f.flavor_text);
      if (texte && !descriptions.includes(texte)) descriptions.push(texte);
      if (descriptions.length === 3) break;
    }

    await ecrire(fichier, {
      id: e.id,
      nom,
      cle: e.name,
      genre: fr(e.genera)?.genus ?? '',
      types,
      gen: generation,
      cat: categorie,
      taille: p.height / 10, // mètres
      poids: p.weight / 10, // kilogrammes
      stats,
      total,
      tauxCapture: e.capture_rate,
      tauxFemelle: e.gender_rate < 0 ? null : e.gender_rate * 12.5,
      descriptions,
      talents: p.abilities
        .sort((a, b) => a.slot - b.slot)
        .map((a) => ({ ...talents.get(a.ability.name), cache: a.is_hidden })),
      sensibilites: calculerSensibilites(types, referentiel),
      evolution: aplatirChaine(chaines.get(idDepuisUrl(e.evolution_chain.url)).chain, nomsEspeces, nomsObjets),
      capacites: capacitesParPokemon[i],
    });
    ecrites++;
  }

  await ecrire('index.json', index);
  console.log(`Terminé : ${index.length} Pokémon dans l'index, ${ecrites} fiches écrites.`);
}

main().catch((erreur) => {
  console.error('\n' + erreur.message);
  process.exit(1);
});
