/**
 * Génère les icônes PNG de la PWA depuis `public/logo.svg`.
 *
 * Deux familles, parce qu'Android ne les traite pas pareil :
 * - `any` : l'icône telle quelle, coins arrondis compris.
 * - `maskable` : le système recadre l'icône dans la forme de son choix
 *   (cercle, écusson…). Il faut donc un fond plein bord à bord et le dessin
 *   confiné dans la zone sûre — un cercle de 80 % du côté. On repose le logo
 *   sur le navy de la marque et on l'insère à 60 % pour rester dedans.
 *
 * Usage : node scripts/build-icons.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "logo.svg");
const OUT = path.join(ROOT, "public", "icons");

/** Navy du logo — sert de fond aux icônes maskables. */
const NAVY = "#022342";

async function main() {
  await mkdir(OUT, { recursive: true });
  const svg = await readFile(SRC);

  // — icônes « any » : le SVG rendu à la taille demandée —
  for (const size of [192, 512]) {
    const buf = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
    await writeFile(path.join(OUT, `icon-${size}.png`), buf);
    console.log(`icon-${size}.png`);
  }

  // — icônes maskables : logo à 60 % centré sur un fond navy plein —
  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.6);
    const logo = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
    const buf = await sharp({
      create: { width: size, height: size, channels: 4, background: NAVY },
    })
      .composite([{ input: logo, gravity: "center" }])
      .png()
      .toBuffer();
    await writeFile(path.join(OUT, `icon-maskable-${size}.png`), buf);
    console.log(`icon-maskable-${size}.png`);
  }

  // — iOS : pas de masque, mais pas de transparence non plus —
  const appleInner = Math.round(180 * 0.72);
  const appleLogo = await sharp(svg, { density: 384 })
    .resize(appleInner, appleInner)
    .png()
    .toBuffer();
  const apple = await sharp({
    create: { width: 180, height: 180, channels: 4, background: NAVY },
  })
    .composite([{ input: appleLogo, gravity: "center" }])
    .png()
    .toBuffer();
  await writeFile(path.join(ROOT, "public", "apple-touch-icon.png"), apple);
  console.log("apple-touch-icon.png");

  // — favicon net en 32 px —
  const fav = await sharp(svg, { density: 384 }).resize(32, 32).png().toBuffer();
  await writeFile(path.join(OUT, "favicon-32.png"), fav);
  console.log("favicon-32.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
