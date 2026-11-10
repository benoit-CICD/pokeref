#!/usr/bin/env node
// Recense, pour chaque extension de cartes de TCGdex (https://tcgdex.dev), combien de cartes
// ont une image (française, ou anglaise à défaut) et si l'extension a un logo.
// Le site s'en sert pour masquer les extensions sur lesquelles on n'a encore rien à montrer.
//
//   node scripts/generate-cartes.mjs
//
// Sortie : data/extensions.json. À relancer de temps en temps : TCGdex ajoute des images
// après la sortie des extensions, et les extensions absentes du fichier restent masquées.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.tcgdex.net/v2';
const CONCURRENCE = 5;
const ESSAIS = 5;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Renvoie le JSON, `null` si la ressource n'existe pas dans cette langue ; réessaie sur erreur. */
async function api(langue, chemin) {
  let derniereErreur;
  for (let essai = 1; essai <= ESSAIS; essai++) {
    try {
      const reponse = await fetch(`${API}/${langue}/${chemin}`);
      if (reponse.status === 404) return null;
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return await reponse.json();
    } catch (erreur) {
      derniereErreur = erreur;
      await pause(400 * 2 ** essai);
    }
  }
  throw new Error(`Échec sur ${langue}/${chemin} : ${derniereErreur.message}`);
}

const [francaises, anglaises] = await Promise.all([api('fr', 'sets'), api('en', 'sets')]);
const logosAnglais = new Set((anglaises ?? []).filter((e) => e.logo).map((e) => e.id));

const resultat = {};
let suivant = 0;
let faits = 0;
async function ouvrier() {
  while (suivant < francaises.length) {
    const extension = francaises[suivant++];
    const chemin = `sets/${encodeURIComponent(extension.id)}`;
    const detail = await api('fr', chemin);
    const cartes = detail?.cards ?? [];
    let images = cartes.filter((c) => c.image).length;
    if (images < cartes.length) {
      // Même repli que le site : image anglaise quand la française manque.
      const anglaise = await api('en', chemin);
      const disponibles = new Set((anglaise?.cards ?? []).filter((c) => c.image).map((c) => c.localId));
      images += cartes.filter((c) => !c.image && disponibles.has(c.localId)).length;
    }
    resultat[extension.id] = {
      images,
      logo: Boolean(extension.logo) || logosAnglais.has(extension.id),
      total: cartes.length,
    };
    faits++;
    if (faits % 20 === 0 || faits === francaises.length) process.stdout.write(`\r  extensions : ${faits}/${francaises.length}   `);
  }
}
await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));

// Clés triées : sortie déterministe pour des diffs Git lisibles.
const trie = Object.fromEntries(Object.keys(resultat).sort().map((id) => [id, resultat[id]]));
await writeFile(join(RACINE, 'data', 'extensions.json'), JSON.stringify(trie, null, 1) + '\n');

const sansImages = Object.values(trie).filter((e) => e.images === 0).length;
console.log(`\nTerminé : ${Object.keys(trie).length} extensions, dont ${sansImages} sans aucune image de carte.`);
