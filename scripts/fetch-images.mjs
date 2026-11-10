#!/usr/bin/env node
// Télécharge l'artwork officiel de chaque Pokémon (dépôt PokeAPI/sprites) et le convertit
// en WebP léger dans assets/img/pokemon/{id}.webp.
//
//   node scripts/fetch-images.mjs
//
// Prérequis : l'outil `cwebp` (macOS : brew install webp ; Debian/Ubuntu : apt install webp).
// Les images déjà présentes ne sont pas retéléchargées.

import { mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const executer = promisify(execFile);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'assets', 'img', 'pokemon');
const SOURCE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const LARGEUR = 320;
const CONCURRENCE = 8;

const existe = (chemin) => access(chemin).then(() => true, () => false);

async function telecharger(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) return null;
  return Buffer.from(await reponse.arrayBuffer());
}

async function traiter(id) {
  const cible = join(SORTIE, `${id}.webp`);
  if (await existe(cible)) return 'présente';
  // Artwork officiel en priorité, sprite classique en repli.
  const png = (await telecharger(`${SOURCE}/other/official-artwork/${id}.png`)) ?? (await telecharger(`${SOURCE}/${id}.png`));
  if (!png) return 'introuvable';
  const temporaire = join(tmpdir(), `pokeref-${process.pid}-${id}.png`);
  await writeFile(temporaire, png);
  try {
    await executer('cwebp', ['-quiet', '-q', '80', '-resize', String(LARGEUR), '0', temporaire, '-o', cible]);
  } finally {
    await rm(temporaire, { force: true });
  }
  return 'créée';
}

const index = JSON.parse(await readFile(join(RACINE, 'data', 'index.json'), 'utf8'));
await mkdir(SORTIE, { recursive: true });

const bilan = { créée: 0, présente: 0, introuvable: 0 };
let suivant = 0;
async function ouvrier() {
  while (suivant < index.length) {
    const { id } = index[suivant++];
    try {
      bilan[await traiter(id)]++;
    } catch (erreur) {
      bilan.introuvable++;
      console.error(`\n#${id} : ${erreur.message}`);
    }
    const faits = bilan.créée + bilan.présente + bilan.introuvable;
    if (faits % 50 === 0) process.stdout.write(`\r  images : ${faits}/${index.length}   `);
  }
}
await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));
console.log(`\nImages : ${bilan.créée} créées, ${bilan.présente} déjà présentes, ${bilan.introuvable} introuvables.`);
