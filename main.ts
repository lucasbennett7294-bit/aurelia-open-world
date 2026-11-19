// Aurelia Bay entry point (Node 22, standard library only).
//
// This program hands the game in: it copies this repository's game/ and
// screenshots/ folders into the grader's output directory and writes the
// dossier.json summary the judge reads, using the vendored make.fun
// library (vendor/makefun-game.ts). The game itself is plain static files
// a desktop browser loads offline — no build step, no network request.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader, MAKEFUN_OUTPUT_DIR is unset and /output is used.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's limits (reference/gate.json): these caps mirror what the
// gate refuses, so a dossier built here never disagrees with the gate.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countTree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countTree(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

function main(): void {
  const repoRoot = fileURLToPath(new URL('.', import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });

  const gameSrc = join(repoRoot, 'game');
  const gameDst = join(outDir, 'game');
  cpSync(gameSrc, gameDst, { recursive: true });

  const shotsSrc = join(repoRoot, 'screenshots');
  const shotsDst = join(outDir, 'screenshots');
  mkdirSync(shotsDst, { recursive: true });
  if (existsSync(shotsSrc)) cpSync(shotsSrc, shotsDst, { recursive: true });

  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const game = countTree(gameDst);
  const shots = existsSync(shotsDst) ? readdirSync(shotsDst).length : 0;
  console.log(
    `Aurelia Bay handed in: game/ ${game.files} files, ${(game.bytes / 1048576).toFixed(2)} MiB; ` +
      `${shots} screenshot(s); dossier.json ${dossier.length} bytes.`,
  );
}

main();
