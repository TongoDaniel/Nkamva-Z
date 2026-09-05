// ==========================================================================
// Lot 6 — La durée se lit dans le fichier (F3.8)
// ==========================================================================
// Aucun de ces tests ne touche le stockage : ils construisent des MP4 en
// mémoire et donnent au lecteur un accès par intervalles sur le `Buffer`. Le
// développement écrit dans le seau de production — un test qui téléverserait
// pour vérifier une lecture serait un test qui salit.
//
// Ce qu'ils tiennent, dans l'ordre : que la durée se lise quand elle est
// lisible, qu'elle se lise **aussi quand `moov` est à la fin** (le cas d'un
// encodeur sans passe *faststart*, c'est-à-dire le cas courant), et qu'aucune
// entrée malformée ne fasse autre chose que rendre `null`.

import { describe, it, expect } from 'vitest'
import { readMp4Duration, type RangeReader } from '@/lib/mp4-duration'

// --- Fabrique de fichiers -------------------------------------------------

/** Une boîte : taille (4) · type (4) · contenu. */
function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + payload.length, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, payload])
}

/** Une boîte à taille étendue : 1 (4) · type (4) · taille 64 bits (8) · contenu. */
function largeBox(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(16)
  header.writeUInt32BE(1, 0)
  header.write(type, 4, 'latin1')
  header.writeBigUInt64BE(BigInt(16 + payload.length), 8)
  return Buffer.concat([header, payload])
}

function mvhdV0(timescale: number, duration: number): Buffer {
  const body = Buffer.alloc(100)
  body.writeUInt8(0, 0) // version
  body.writeUInt32BE(0, 4) // création
  body.writeUInt32BE(0, 8) // modification
  body.writeUInt32BE(timescale, 12)
  body.writeUInt32BE(duration, 16)
  return box('mvhd', body)
}

function mvhdV1(timescale: number, duration: bigint): Buffer {
  const body = Buffer.alloc(112)
  body.writeUInt8(1, 0)
  body.writeBigUInt64BE(BigInt(0), 4)
  body.writeBigUInt64BE(BigInt(0), 12)
  body.writeUInt32BE(timescale, 20)
  body.writeBigUInt64BE(duration, 24)
  return box('mvhd', body)
}

const ftyp = box('ftyp', Buffer.from('isomiso2avc1mp41', 'latin1'))
/** Les images. Sa taille est lue dans son en-tête, ses octets ne sont jamais parcourus. */
const mdat = (size: number) => box('mdat', Buffer.alloc(size, 0x42))

/** Accès par intervalles sur un `Buffer`, aux mêmes bornes inclusives que HTTP. */
function reader(file: Buffer): RangeReader {
  return async (start, end) => {
    if (start >= file.length) return null
    return file.subarray(start, Math.min(end + 1, file.length))
  }
}

/** Compte les lectures, pour vérifier qu'on ne rapatrie pas le fichier. */
function countingReader(file: Buffer): { read: RangeReader; calls: () => number; bytes: () => number } {
  let calls = 0
  let bytes = 0
  const base = reader(file)
  return {
    read: async (start, end) => {
      calls++
      const out = await base(start, end)
      bytes += out?.length ?? 0
      return out
    },
    calls: () => calls,
    bytes: () => bytes,
  }
}

describe('Lot 6 — durée d\'un MP4', () => {
  // --- Le cas nominal, et sa variante la plus fréquente --------------------

  it('lit la durée quand moov est au début', async () => {
    const file = Buffer.concat([ftyp, box('moov', mvhdV0(600, 600 * 754)), mdat(4096)])
    expect(await readMp4Duration(reader(file), file.length)).toBe(754)
  })

  it('lit la durée quand moov est à la fin, derrière les images', async () => {
    // Le cas d'un encodeur sans passe *faststart* : c'est celui qu'on
    // rencontrera le plus souvent, et celui qui casse une lecture naïve des
    // premiers kilo-octets.
    const file = Buffer.concat([ftyp, mdat(65_536), box('moov', mvhdV0(1000, 1000 * 3600))])
    expect(await readMp4Duration(reader(file), file.length)).toBe(3600)
  })

  it('ne parcourt pas les images : quelques lectures de seize octets suffisent', async () => {
    const file = Buffer.concat([ftyp, mdat(5_000_000), box('moov', mvhdV0(600, 600 * 120))])
    const r = countingReader(file)

    expect(await readMp4Duration(r.read, file.length)).toBe(120)
    expect(r.calls()).toBeLessThan(10)
    // Cinq mégaoctets de fichier, moins de deux cents octets lus.
    expect(r.bytes()).toBeLessThan(200)
  })

  it('lit une durée en version 1', async () => {
    const file = Buffer.concat([ftyp, box('moov', mvhdV1(90_000, BigInt(90_000 * 1830)))])
    expect(await readMp4Duration(reader(file), file.length)).toBe(1830)
  })

  it('accepte une taille étendue sur 64 bits', async () => {
    // Ce que produit un encodeur pour une boîte de plus de 4 Go — en pratique
    // `mdat`, mais rien n'interdit la forme ailleurs.
    const file = Buffer.concat([ftyp, largeBox('moov', mvhdV0(600, 600 * 42))])
    expect(await readMp4Duration(reader(file), file.length)).toBe(42)
  })

  it('trouve mvhd même précédé d\'une boîte de bourrage', async () => {
    const moov = box('moov', Buffer.concat([box('free', Buffer.alloc(64)), mvhdV0(600, 600 * 99)]))
    const file = Buffer.concat([ftyp, moov])
    expect(await readMp4Duration(reader(file), file.length)).toBe(99)
  })

  it('arrondit à la seconde', async () => {
    const file = Buffer.concat([ftyp, box('moov', mvhdV0(1000, 754_600))])
    expect(await readMp4Duration(reader(file), file.length)).toBe(755)
  })

  // --- Tout ce qui rate rend null, et rien d'autre -------------------------

  it('sans moov, rien', async () => {
    const file = Buffer.concat([ftyp, mdat(1024)])
    expect(await readMp4Duration(reader(file), file.length)).toBeNull()
  })

  it('sans mvhd dans moov, rien', async () => {
    const file = Buffer.concat([ftyp, box('moov', box('trak', Buffer.alloc(32)))])
    expect(await readMp4Duration(reader(file), file.length)).toBeNull()
  })

  it('une durée déclarée inconnue reste inconnue', async () => {
    // 0xFFFFFFFF est la façon dont le format dit « je ne sais pas ». La lire
    // comme un nombre donnerait 4 294 967 295 tics — soit, à 600 Hz, quatre
    //-vingt-deux jours de vidéo.
    const file = Buffer.concat([ftyp, box('moov', mvhdV0(600, 0xffffffff))])
    expect(await readMp4Duration(reader(file), file.length)).toBeNull()
  })

  it('une échelle de temps nulle ne divise rien', async () => {
    const file = Buffer.concat([ftyp, box('moov', mvhdV0(0, 12_000))])
    expect(await readMp4Duration(reader(file), file.length)).toBeNull()
  })

  it('au-delà de vingt-quatre heures, on préfère ne rien dire', async () => {
    // Mieux vaut aucune durée qu'une durée fausse : c'est elle qui arbitre le
    // seuil de consommation d'un litige.
    const file = Buffer.concat([ftyp, box('moov', mvhdV0(1, 90_000))])
    expect(await readMp4Duration(reader(file), file.length)).toBeNull()
  })

  it('un fichier qui n\'est pas un MP4 rend null sans boucler', async () => {
    const file = Buffer.alloc(4096, 0xff)
    const r = countingReader(file)
    expect(await readMp4Duration(r.read, file.length)).toBeNull()
    expect(r.calls()).toBeLessThan(4)
  })

  it('un fichier tronqué en plein moov rend null', async () => {
    const complet = Buffer.concat([ftyp, box('moov', mvhdV0(600, 600 * 300))])
    const tronque = complet.subarray(0, ftyp.length + 12)
    expect(await readMp4Duration(reader(tronque), tronque.length)).toBeNull()
  })

  it('un fichier vide rend null', async () => {
    expect(await readMp4Duration(reader(Buffer.alloc(0)), 0)).toBeNull()
  })

  it('une lecture qui échoue rend null, elle ne lève pas', async () => {
    // C'est le cas du développement sans identifiants de stockage : `getRange`
    // rend `null` et la publication continue sans durée.
    const muet: RangeReader = async () => null
    expect(await readMp4Duration(muet, 1_000_000)).toBeNull()
  })

  it('une taille de boîte aberrante ne fait pas sortir du fichier', async () => {
    const file = Buffer.alloc(64)
    file.writeUInt32BE(0xfffffff0, 0) // une boîte plus grande que le fichier
    file.write('moov', 4, 'latin1')
    expect(await readMp4Duration(reader(file), file.length)).toBeNull()
  })
})
