#!/usr/bin/env node
// Incrémente la version des données (VERSION dans assets/js/commun.js et le préchargement
// de index.html) pour que les navigateurs rechargent les JSON après une régénération.
//
//   node scripts/bump-version.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichierJs = join(RACINE, 'assets', 'js', 'commun.js');
const fichierHtml = join(RACINE, 'index.html');

const js = await readFile(fichierJs, 'utf8');
const trouve = js.match(/export const VERSION = '(\d+)';/);
if (!trouve) throw new Error('VERSION introuvable dans assets/js/commun.js');
const ancienne = Number(trouve[1]);
const nouvelle = ancienne + 1;

const html = await readFile(fichierHtml, 'utf8');
const prechargement = `data/index.json?v=${ancienne}`;
if (!html.includes(prechargement)) throw new Error(`« ${prechargement} » introuvable dans index.html`);

await writeFile(fichierJs, js.replace(trouve[0], `export const VERSION = '${nouvelle}';`));
await writeFile(fichierHtml, html.replace(prechargement, `data/index.json?v=${nouvelle}`));
console.log(`Version des données : ${ancienne} → ${nouvelle}`);
