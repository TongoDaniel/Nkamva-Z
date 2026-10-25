// ==========================================================================
// Lot 4 — Gestion des cours côté formateur : CRUD, upload R2, publication
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { presignUpload, headObject, validateMagicNumber, deleteObject } from './s3'
import { readMp4DurationFromStorage } from './mp4-duration'
import { readPdfPageCountFromStorage } from './pdf-pages'
import { canTrainerWrite } from './subscriptions'
import {
  circuitIsStillOpen,
  MIN_COURSE_PRICE_FCFA,
  type CourseCircuitValue,
} from './course-rules'
import type { PrismaTransaction } from './types'
import {
  COVER_IMAGE_MAX_BYTES,
  LARGE_FILE_MAX_BYTES,
  PDF_MAX_BYTES,
  STORAGE_TIER_BYTES,
  TRAINER_STORAGE_QUOTA_BYTES,
} from './rules'

export const COURSE_UPLOAD_LIMITS = {
  video: { mimes: ['video/mp4'], maxSize: LARGE_FILE_MAX_BYTES },
  pdf: { mimes: ['application/pdf'], maxSize: PDF_MAX_BYTES },
  image: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxSize: COVER_IMAGE_MAX_BYTES },
  /**
   * Archives — sans elles, `kit`, `notion` et `tableur` (trois des cinq formats
   * proposés à la saisie, tous « téléchargeables ») n'avaient aucun type de
   * fichier acceptable : ils étaient impubliables.
   *
   * Quatre types MIME pour deux formats : Windows annonce les .zip en
   * `x-zip-compressed` et les .rar en `x-rar-compressed` quand un logiciel est
   * associé. Le plafond est celui de la vidéo — un kit embarque des médias, et
   * c'est le quota de stockage qui borne réellement.
   */
  archive: {
    mimes: [
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.rar',
      'application/x-rar-compressed',
    ],
    maxSize: LARGE_FILE_MAX_BYTES,
  },
} as const

export type CourseUploadKind = keyof typeof COURSE_UPLOAD_LIMITS

/**
 * Le genre de fichier qu'attend chaque format annoncé (F3.9).
 *
 * Rien ne reliait les deux : une ressource déclarée « Vidéo » pouvait porter un
 * PDF, et le lecteur de l'acheteur rendait consciencieusement ce PDF dans une
 * balise `<video>` — écran noir, aucune progression mesurable. C'est le défaut
 * que l'audit a rencontré, et il ne se corrige pas dans le lecteur : il se
 * corrige ici, en refusant que l'annonce et le fichier se contredisent.
 *
 * Les trois formats téléchargeables partagent un genre : kit, modèle et
 * tableur se livrent tous en archive. Passer de l'un à l'autre reste donc
 * libre — ce qui change est le mot, pas le fichier.
 */
export const CONTENT_KIND_BY_FORMAT: Record<string, CourseUploadKind> = {
  video: 'video',
  pdf: 'pdf',
  kit: 'archive',
  notion: 'archive',
  tableur: 'archive',
}

/** Le genre d'un fichier déjà déposé, relu depuis son type MIME enregistré. */
export function uploadKindForMime(mimeType: string | null | undefined): CourseUploadKind | null {
  if (!mimeType) return null
  for (const [kind, limits] of Object.entries(COURSE_UPLOAD_LIMITS)) {
    if ((limits.mimes as readonly string[]).includes(mimeType)) return kind as CourseUploadKind
  }
  return null
}

/**
 * Extension de la clé R2. `mimeType.split('/')[1]` suffisait tant que le
 * sous-type *était* l'extension ; il donne `vnd.rar` ou `x-zip-compressed` pour
 * les archives.
 */
const EXT_BY_MIME: Record<string, string> = {
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/vnd.rar': 'rar',
  'application/x-rar-compressed': 'rar',
}

/**
 * Arbitrages 54 et 69 — 40 Go inclus par formateur, puis des tranches de 50 Go.
 * Le quota porte sur celui qui téléverse, pas sur la communauté ni sur
 * l'apprenant. Les tailles vivent dans `rules.ts` ; le **prix** d'une tranche,
 * lui, est administré et vit en base (voir `storage-tiers.ts`).
 */
export { TRAINER_STORAGE_QUOTA_BYTES, STORAGE_TIER_BYTES } from './rules'

/**
 * Octets déjà occupés par un formateur. Somme les tailles réellement
 * enregistrées à la confirmation, jamais celles annoncées par le client.
 *
 * **Ce qu'il ne peut pas effacer ne lui est pas compté** (arbitrage 13). Deux
 * catégories en sortent, pour la même raison :
 *
 * - les ressources **sous obligation**, c'est-à-dire déjà achetées par
 *   quelqu'un : les supprimer couperait l'accès d'un acheteur, ce que l'achat
 *   définitif interdit. Sans cette exclusion, un formateur restait enfermé dans
 *   un palier payant qu'aucune action de sa part ne pouvait libérer ;
 * - les replays d'une **communauté payante** (arbitrage 17) : des membres ont
 *   payé pour y accéder, et la décision 51 le promet sur 24 mois. Le replay
 *   d'une communauté gratuite, lui, reste compté — personne n'a rien payé pour
 *   celui-là.
 *
 * **Les replays comptent donc encore**, mais plus tous (arbitrage 54 amendé) :
 * un live en produit un automatiquement (arbitrage 38), et un formateur peut
 * toujours épuiser son quota sans avoir rien téléversé lui-même. Un replay purgé
 * au bout de 24 mois (arbitrage 51) lui rend la place — d'où le filtre sur
 * `purgedAt`. Ceux hébergés chez Mux n'ont jamais compté : leur `sizeBytes` est
 * nul à dessein.
 *
 * **La bannière de communauté aussi** : c'est un objet déposé sur R2 par le
 * même formateur, il pèse sur le même quota que la couverture d'un cours.
 */
export async function trainerStorageUsedBytes(trainerId: string): Promise<number> {
  const [courses, replays, communities] = await Promise.all([
    db.course.aggregate({
      where: { trainerId, obligationAt: null },
      _sum: { contentSizeBytes: true, coverSizeBytes: true },
    }),
    db.replay.aggregate({
      where: {
        trainerId,
        purgedAt: null,
        // `priceFcfa: 0` et non `{ gt: 0 }` inversé : une communauté gratuite
        // n'engage rien envers personne, son replay reste à la charge du
        // formateur. La condition porte sur le prix **actuel** de la
        // communauté — une communauté qui devient payante fait sortir ses
        // replays du quota au renouvellement suivant, comme le reste.
        community: { priceFcfa: 0 },
      },
      // La variante audio (arbitrage 94) est dans le même seau que la vidéo :
      // ce sont nos octets, ils comptent. ~60 Mo pour deux heures — négligeable
      // à l'unité, pas sur deux ans de séances hebdomadaires.
      _sum: { sizeBytes: true, audioSizeBytes: true },
    }),
    db.community.aggregate({
      where: { trainerId },
      // La photo du groupe est comptée comme la bannière : deux images
      // publiées par le même formateur, dans le même seau.
      _sum: { coverSizeBytes: true, avatarSizeBytes: true },
    }),
  ])
  // Colonnes BIGINT — une seule vidéo peut peser 2 Go, soit un octet de plus
  // qu'un entier 32 bits. La somme repasse en `number` ici : 40 Go tient
  // largement sous la limite d'exactitude de JavaScript (9 Po).
  // `BigInt(0)` plutôt que le littéral `0n` : la cible TypeScript du projet
  // est antérieure à ES2020.
  const total =
    (courses._sum.contentSizeBytes ?? BigInt(0)) +
    (courses._sum.coverSizeBytes ?? BigInt(0)) +
    (replays._sum.sizeBytes ?? BigInt(0)) +
    (replays._sum.audioSizeBytes ?? BigInt(0)) +
    (communities._sum.coverSizeBytes ?? BigInt(0)) +
    (communities._sum.avatarSizeBytes ?? BigInt(0))
  return Number(total)
}

/**
 * Quota effectif : les 40 Go inclus, plus les paliers de 50 Go achetés
 * (arbitrage 69). Lire le profil ici plutôt que la constante seule est ce qui
 * rend l'extension réelle — sinon un formateur paierait de l'espace sans jamais
 * pouvoir s'en servir.
 */
export async function trainerStorage(trainerId: string) {
  const [usedBytes, profile] = await Promise.all([
    trainerStorageUsedBytes(trainerId),
    db.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { storageTiers: true },
    }),
  ])
  const quotaBytes =
    TRAINER_STORAGE_QUOTA_BYTES + (profile?.storageTiers ?? 0) * STORAGE_TIER_BYTES
  return {
    usedBytes,
    quotaBytes,
    remainingBytes: Math.max(0, quotaBytes - usedBytes),
  }
}

export async function createCourse(
  trainerId: string,
  userId: string,
  data: {
    title: string
    blurb: string
    description: string
    category: string
    format: string
    priceFcfa: number
    level?: string
    learnPoints?: string[]
    includes?: string[]
    /**
     * Où va la ressource. Absente, elle va au catalogue — c'est le défaut de la
     * colonne, et celui de tout ce qui existait avant ce choix.
     */
    circuit?: CourseCircuitValue
  },
) {
  const circuit: CourseCircuitValue = data.circuit ?? 'MARKETPLACE'

  // Le plancher ne vaut que pour ce qui est vendu. Une ressource incluse dans
  // une communauté n'a pas de prix à l'unité : l'achat en est refusé
  // (`COURSE_NOT_FOR_SALE`), et un montant y serait un chiffre que rien ne
  // facture. Elle est donc écrite à 0, et le formulaire ne le demande pas.
  if (circuit === 'MARKETPLACE' && data.priceFcfa < MIN_COURSE_PRICE_FCFA) {
    throw new Error('PRICE_TOO_LOW')
  }
  // Décision 68 — un abonnement suspendu bloque l'écriture. Jamais la lecture :
  // rien de ce qui est déjà acheté n'est touché.
  if (!(await canTrainerWrite(trainerId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  // Les mêmes gardes que `linkCourseToCommunity`, parce que c'est la même
  // liaison qui va naître : une communauté qui vit (`status`), et son rayon
  // ressources allumé (arbitrage 136 — remplir une étagère qu'on a soi-même
  // cachée). L'absence couvre les deux cas d'une communauté fermée ou jamais
  // ouverte : il n'y en a qu'une par formateur.
  const community =
    circuit === 'COMMUNITY'
      ? await db.community.findFirst({
          where: { trainerId, status: 'active' },
          select: { id: true, resourcesEnabled: true },
        })
      : null
  if (circuit === 'COMMUNITY') {
    if (!community) throw new Error('COMMUNITY_NOT_FOUND')
    if (!community.resourcesEnabled) throw new Error('COMMUNITY_RESOURCES_DISABLED')
  }

  const slug = await generateSlug(data.title)

  // Une transaction, et pas deux écritures : une ressource au circuit
  // `COMMUNITY` sans ligne de liaison n'est visible **nulle part** — ni en
  // vente, puisque l'achat la refuse, ni sur l'étagère, qui part des liaisons.
  // Elle existerait sans exister.
  const course = await db.$transaction(async (tx) => {
    const created = await tx.course.create({
      data: {
        trainerId,
        slug,
        title: data.title,
        blurb: data.blurb,
        description: data.description,
        category: data.category,
        format: data.format,
        priceFcfa: circuit === 'COMMUNITY' ? 0 : data.priceFcfa,
        level: data.level || null,
        // Pas de durée à la création : elle naîtra du fichier (F3.8).
        learnPoints: data.learnPoints || [],
        includes: data.includes || [],
        status: 'draft',
        circuit,
      },
    })
    if (community) {
      await tx.communityCourse.create({ data: { communityId: community.id, courseId: created.id } })
    }
    return created
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COURSE_CREATED', targetType: 'Course', targetId: course.id,
    meta: { title: data.title, slug, circuit },
  })

  // La même trace que par l'écran de la communauté : sans elle, l'historique
  // du salon aurait un trou à chaque ressource créée directement incluse.
  if (community) {
    await auditStandalone({
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_COURSE_LINKED', targetType: 'Community', targetId: community.id,
      meta: { courseId: course.id, atCreation: true },
    })
  }

  return course
}

export async function updateCourse(
  courseId: string,
  trainerId: string,
  userId: string,
  data: Partial<{
    title: string
    blurb: string
    description: string
    category: string
    format: string
    priceFcfa: number
    level: string
    learnPoints: string[]
    includes: string[]
    coverS3Key: string
    /** Change la destination — refusé dès que la ressource s'est engagée. */
    circuit: CourseCircuitValue
  }>,
) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { _count: { select: { purchases: true } } },
  })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')

  // Changer le format d'une ressource dont le contenu est déjà là ne doit pas
  // pouvoir recréer la contradiction que la confirmation refuse (F3.9). Le
  // fichier fait foi : on demande de le remplacer, on ne le renie pas.
  if (data.format && data.format !== course.format && course.contentS3Key) {
    const depose = uploadKindForMime(course.contentMimeType)
    const attendu = CONTENT_KIND_BY_FORMAT[data.format]
    if (depose && attendu && depose !== attendu) throw new Error('FORMAT_CONTRADICTS_CONTENT')
  }

  // ------------------------------------------------------------------ circuit
  //
  // La destination reste modifiable **tant que la ressource n'a rien engagé** :
  // brouillon jamais publié, jamais acheté (voir `circuitIsStillOpen`). Après,
  // l'arbitrage 137 reprend la main — ce qui a été annoncé comme inclus ne
  // repasse pas derrière un péage, et ce qui a été vendu ne devient pas gratuit
  // pour les abonnés.
  const currentCircuit = course.circuit as CourseCircuitValue
  const nextCircuit: CourseCircuitValue = data.circuit ?? currentCircuit
  const circuitChanges = nextCircuit !== currentCircuit

  if (circuitChanges) {
    const open = circuitIsStillOpen({
      status: course.status,
      publishedAt: course.publishedAt,
      purchaseCount: course._count.purchases,
    })
    if (!open) throw new Error('CIRCUIT_LOCKED')
  }

  // La communauté d'accueil, aux mêmes conditions qu'à la création.
  const community =
    circuitChanges && nextCircuit === 'COMMUNITY'
      ? await db.community.findFirst({
          where: { trainerId, status: 'active' },
          select: { id: true, resourcesEnabled: true },
        })
      : null
  if (circuitChanges && nextCircuit === 'COMMUNITY') {
    if (!community) throw new Error('COMMUNITY_NOT_FOUND')
    if (!community.resourcesEnabled) throw new Error('COMMUNITY_RESOURCES_DISABLED')
  }

  // Le prix suit la destination, et le plancher ne vaut que pour ce qui se
  // vend. Il était jusqu'ici absent de cette fonction : seule la route posait
  // un minimum, donc un appel direct pouvait écrire 1 FCFA.
  const nextPrice =
    nextCircuit === 'COMMUNITY' ? 0 : (data.priceFcfa ?? course.priceFcfa)
  if (nextCircuit === 'MARKETPLACE' && nextPrice < MIN_COURSE_PRICE_FCFA) {
    throw new Error('PRICE_TOO_LOW')
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.course.update({
      where: { id: courseId },
      data: {
        ...(data.title && { title: data.title, slug: await generateSlug(data.title, courseId) }),
        ...(data.blurb !== undefined && { blurb: data.blurb }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category && { category: data.category }),
        ...(data.format && { format: data.format }),
        ...(nextPrice !== course.priceFcfa && { priceFcfa: nextPrice }),
        ...(data.level !== undefined && { level: data.level }),
        ...(data.learnPoints !== undefined && { learnPoints: data.learnPoints }),
        ...(data.includes !== undefined && { includes: data.includes }),
        ...(data.coverS3Key !== undefined && { coverS3Key: data.coverS3Key }),
        ...(circuitChanges && { circuit: nextCircuit }),
      },
    })

    if (circuitChanges && community) {
      await tx.communityCourse.create({ data: { communityId: community.id, courseId } })
    }
    if (circuitChanges && nextCircuit === 'MARKETPLACE') {
      // Bornée, jamais supprimée : c'est la règle de l'arbitrage 48, et elle
      // vaut même ici où personne n'a rien reçu — une ligne effacée effacerait
      // aussi la trace du passage.
      await tx.communityCourse.updateMany({
        where: { courseId, unlinkedAt: null },
        data: { unlinkedAt: new Date() },
      })
    }

    return row
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COURSE_UPDATED', targetType: 'Course', targetId: courseId,
    ...(circuitChanges && { meta: { circuit: nextCircuit, from: currentCircuit } }),
  })

  if (circuitChanges && community) {
    await auditStandalone({
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_COURSE_LINKED', targetType: 'Community', targetId: community.id,
      meta: { courseId, viaCircuitChange: true },
    })
  }

  return updated
}

export async function publishCourse(courseId: string, trainerId: string, userId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')
  if (course.status === 'published') throw new Error('ALREADY_PUBLISHED')
  // Décision 68 — les ressources d'un formateur suspendu sortent du catalogue ;
  // il ne peut pas les y remettre en republiant.
  if (!(await canTrainerWrite(trainerId))) throw new Error('SUBSCRIPTION_SUSPENDED')
  // Rien ne l'empêchait de publier une ressource sans contenu, donc de la
  // vendre. L'acheteur ne l'aurait découvert qu'après paiement.
  if (!course.contentS3Key) throw new Error('CONTENT_REQUIRED')

  const updated = await db.course.update({
    where: { id: courseId },
    data: { status: 'published', publishedAt: new Date() },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COURSE_PUBLISHED', targetType: 'Course', targetId: courseId,
  })

  return updated
}

export async function archiveCourse(courseId: string, trainerId: string, userId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')

  return db.course.update({
    where: { id: courseId },
    data: { status: 'archived' },
  })
}

/**
 * Supprime le **contenu** d'une ressource — arbitrage 18.
 *
 * Ce geste n'existait pas, et son absence était un défaut : `archiveCourse` ne
 * change qu'une chaîne de caractères, les octets restent sur R2 et continuent
 * de peser sur le quota. Le quota d'un formateur ne pouvait donc que **croître**
 * depuis son inscription — seule la purge des replays à 24 mois lui rendait de
 * la place. Le commentaire de `setTrainerStorageTiers` lui conseillait de
 * « libérer de l'espace d'abord » ; il n'avait aucun moyen de le faire.
 *
 * **Ce qui part** : l'objet sur R2 et les trois champs qui le décrivent.
 * **Ce qui reste** : la fiche, son historique, ses statistiques, ses liens. Rien
 * en aval ne casse — ni les vues, ni les favoris, ni le rattachement à une
 * communauté.
 *
 * **Ce qu'on refuse** : supprimer le contenu d'une ressource **vendue**. Elle
 * est sous obligation (arbitrage 13) et doit continuer d'être servie à ses
 * acheteurs ; c'est d'ailleurs pour cela qu'elle ne lui est plus comptée.
 *
 * La ressource repasse en brouillon : publiée sans contenu, elle serait
 * achetable et livrerait du vide — c'est exactement ce que `publishCourse`
 * refuse déjà à l'entrée.
 */
export async function deleteCourseContent(courseId: string, trainerId: string, userId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')
  if (course.obligationAt) throw new Error('COURSE_SOLD')
  if (!course.contentS3Key) throw new Error('NO_CONTENT')

  // L'objet part **avant** la base. Dans l'autre sens, un échec de suppression
  // laisserait un octet payé par le formateur sans plus aucune trace pour le
  // retrouver — le pire des deux mondes.
  await deleteObject(course.contentS3Key)

  const updated = await db.course.update({
    where: { id: courseId },
    data: {
      contentS3Key: null,
      contentSizeBytes: null,
      contentMimeType: null,
      status: 'draft',
    },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COURSE_CONTENT_DELETED', targetType: 'Course', targetId: courseId,
    meta: {
      s3Key: course.contentS3Key,
      freedBytes: Number(course.contentSizeBytes ?? BigInt(0)),
      previousStatus: course.status,
    },
  })

  return updated
}

export async function listTrainerCourses(trainerId: string, status?: string) {
  return db.course.findMany({
    where: { trainerId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
  })
}

// --- Upload du contenu du cours via R2 présigné ---

export async function presignCourseUpload(
  courseId: string,
  trainerId: string,
  params: { mimeType: string; sizeBytes: number; kind: CourseUploadKind },
) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')
  // Décision 68 — le téléversement est un chemin d'écriture, il est bloqué.
  if (!(await canTrainerWrite(trainerId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  const limits = COURSE_UPLOAD_LIMITS[params.kind]
  // `mimes` est un tuple de littéraux : sans élargissement, `includes` refuse
  // toute chaîne quelconque et ne compile pas.
  if (!(limits.mimes as readonly string[]).includes(params.mimeType)) throw new Error('MIME_NOT_ALLOWED')
  if (params.sizeBytes > limits.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')

  // Arbitrage 54 — le blocage ne porte que sur le chemin d'écriture. La taille
  // annoncée par le client suffit ici : la vérité est reprise à la
  // confirmation, sur l'objet réellement déposé.
  const { remainingBytes } = await trainerStorage(trainerId)
  if (params.sizeBytes > remainingBytes) throw new Error('STORAGE_QUOTA_EXCEEDED')

  const ext = EXT_BY_MIME[params.mimeType] ?? params.mimeType.split('/')[1]
  const s3Key = `course-assets/${courseId}/${params.kind}-${crypto.randomUUID()}.${ext}`
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)

  return { uploadUrl, s3Key, expiresAt }
}

/**
 * Confirme un téléversement : c'est ici, et seulement ici, que la clé entre en
 * base. Sans cette étape le fichier existait sur R2 sans que rien ne le
 * référence — le formateur croyait avoir publié, l'acheteur recevait une URL
 * signée vers une clé devinée qui n'a jamais été écrite.
 *
 * La taille est relue sur l'objet (`headObject`), jamais reprise du client :
 * c'est elle qui alimente le quota, elle ne peut pas être déclarative. Depuis
 * le lot 6, **la durée d'une vidéo l'est aussi** — au même endroit et pour la
 * même raison (F3.8).
 */
export async function confirmCourseUpload(
  courseId: string,
  trainerId: string,
  userId: string,
  params: { s3Key: string; kind: CourseUploadKind; mimeType: string },
) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')
  if (!(await canTrainerWrite(trainerId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  // La clé doit être celle que nous avons émise pour CE cours : sinon un
  // formateur pourrait rattacher l'objet d'un autre.
  if (!params.s3Key.startsWith(`course-assets/${courseId}/`)) throw new Error('UPLOAD_NOT_FOUND')

  const limits = COURSE_UPLOAD_LIMITS[params.kind]
  if (!(limits.mimes as readonly string[]).includes(params.mimeType)) throw new Error('MIME_NOT_ALLOWED')

  // Le contenu vendu doit être du genre que la fiche annonce (F3.9). Une
  // couverture échappe à la règle : c'est une image, quel que soit le format.
  if (params.kind !== 'image') {
    const attendu = CONTENT_KIND_BY_FORMAT[course.format]
    if (attendu && attendu !== params.kind) throw new Error('CONTENT_FORMAT_MISMATCH')
  }

  // Même contrôle de contenu que les pièces justificatives du Lot 1 : un PDF
  // renommé en .mp4 est refusé. Sans identifiants R2, `headObject` renvoie null
  // et la validation est sautée — le mode dev ne dépose rien de réel.
  //
  // **Sauf les archives** (arbitrage du 8 août 2026) : l'extension fait foi, le
  // contenu n'est pas inspecté. Un .zip authentique peut de toute façon
  // renfermer n'importe quoi — le contrôle établissait « c'est bien un zip »,
  // jamais « c'est sain ». Et un fichier illisible se voit à l'usage : c'est
  // l'apprenant qui le signale, par la voie des litiges. Les autres genres le
  // gardent, eux : une image ou un PDF sont *rendus* par le navigateur, pas
  // seulement téléchargés, et un contenu déguisé s'y exécute.
  const head = await headObject(params.s3Key)
  if (head) {
    if (params.kind !== 'archive') await validateMagicNumber(params.s3Key, params.mimeType)
    // Zéro octet reste refusé pour tout le monde : c'est une vente vide, et le
    // constat ne coûte rien — la taille vient du `headObject` déjà fait.
    if (head.contentLength === 0) throw new Error('EMPTY_FILE')
    if (head.contentLength > limits.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')
  }
  const sizeBytes = head?.contentLength ?? 0

  // F3.8 — la longueur du contenu se mesure sur l'objet, elle ne se déclare
  // plus. Une **durée** pour une vidéo, un **nombre de pages** pour un
  // document : dans les deux cas, ce qui permettra à l'apprenant de savoir où
  // il en est, et à un agent du support de savoir ce qui a été consommé.
  //
  // La vidéo se lit par intervalles — quelques dizaines d'octets sur deux
  // gigaoctets possibles. Le PDF, plafonné à dix mégaoctets, se rapatrie une
  // fois : sa table des objets vit à la fin, souvent compressée.
  //
  // Les deux sont **réécrites à chaque dépôt**, y compris à `null`. Sans cela,
  // la mesure d'un fichier remplacé — ou la durée qu'un formateur avait saisie
  // du temps où le champ existait — survivrait à ce qu'elle décrivait, et
  // continuerait d'arbitrer la progression et le seuil de consommation d'un
  // litige. Un contenu d'un autre genre n'a ni l'une ni l'autre.
  const isCover = params.kind === 'image'
  const durationSeconds =
    params.kind === 'video' ? await readMp4DurationFromStorage(params.s3Key, sizeBytes) : null
  const pageCount =
    params.kind === 'pdf' ? await readPdfPageCountFromStorage(params.s3Key, sizeBytes) : null

  const updated = await db.course.update({
    where: { id: courseId },
    data: isCover
      ? { coverS3Key: params.s3Key, coverSizeBytes: BigInt(sizeBytes) }
      : {
          contentS3Key: params.s3Key,
          contentSizeBytes: BigInt(sizeBytes),
          contentMimeType: params.mimeType,
          durationSeconds,
          pageCount,
        },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: isCover ? 'COURSE_COVER_UPLOADED' : 'COURSE_CONTENT_UPLOADED',
    targetType: 'Course', targetId: courseId,
    // La durée mesurée est journalisée : c'est une donnée que personne n'a
    // saisie, et le formateur doit pouvoir retrouver d'où elle vient.
    meta: {
      s3Key: params.s3Key, sizeBytes, mimeType: params.mimeType,
      ...(isCover ? {} : { durationSeconds, pageCount }),
    },
  })

  return updated
}

// --- Helper : générer un slug unique ---

async function generateSlug(title: string, excludeId?: string): Promise<string> {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  // Un titre sans lettre latine (emojis, écriture arabe) donnait un slug vide,
  // puis « -1 », « -2 » (campagne du 12 octobre 2026, m4) : une adresse
  // publique sans mot. On repart d'un mot neutre.
  const root = base || 'ressource'
  let slug = root
  let counter = 1
  while (true) {
    const existing = await db.course.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (!existing) break
    slug = `${root}-${counter++}`
  }
  return slug
}
