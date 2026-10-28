// ==========================================================================
// Aide & FAQ — contenu administrable
// ==========================================================================
// Le centre d'aide et la FAQ de l'accueil vivent en base (`help_categories`,
// `help_articles`) et s'éditent depuis /admin/aide, par le Super-admin et la
// Modération.
//
// Une réponse est du **texte brut**, avec deux constructions et rien d'autre :
//
//   · `{cle}` — un **marqueur**, remplacé au rendu par une valeur tirée de sa
//     source unique (`lib/commission`, `lib/rules`, `lib/pricing`…). Un chiffre
//     ne s'écrit jamais à la main : le jour où la commission change, toutes les
//     réponses qui la citent changent avec elle ;
//   · `[texte](/chemin)` — un lien vers une page **du site**. Seul un chemin
//     interne est accepté : une réponse d'aide n'envoie pas ailleurs, et rien
//     de ce qu'on y écrit ne devient du HTML.
//
// Un marqueur inconnu ou un lien invalide est refusé à l'enregistrement : le
// site n'affiche jamais `{comission}` mal orthographié.
// ==========================================================================

import { db } from './db'
import { audit } from './audit'
import { COMMISSION_LABEL, TRAINER_SHARE_LABEL } from './commission'
import { fmtFcfa } from './format'
import { payableMarkets } from './markets'
import { publicSubscriptionPlans, subscriptionAnnouncement } from './pricing'
import {
  CONSUMPTION_THRESHOLD_LABEL,
  DELETION_GRACE_DAYS,
  DISPUTE_OPENING_WINDOW_DAYS,
  LEARNER_RESPONSE_DEADLINE_DAYS,
  PAYOUT_METHOD_CARENCE_HOURS,
  PAYOUT_MIN_AMOUNT_FCFA,
} from './rules'
import { getSettingNumber } from './settings'

import {
  HELP_ICON_KEYS, answerProblems, renderAnswer, slugify,
  type AnswerSegment, type HelpIconKey, type HelpValues,
} from './help-text'

export * from './help-text'

const pluralDays = (n: number) => `${n} jour${n > 1 ? 's' : ''}`

/** Les valeurs réelles, lues à leur source unique au moment du rendu. */
export async function loadHelpValues(): Promise<HelpValues> {
  const [plans, responseHours, markets] = await Promise.all([
    publicSubscriptionPlans(),
    getSettingNumber('support.response_time_hours'),
    payableMarkets(),
  ])
  return {
    commission: COMMISSION_LABEL,
    part_formateur: TRAINER_SHARE_LABEL,
    abonnement_formateur: subscriptionAnnouncement(plans),
    delai_contestation: pluralDays(DISPUTE_OPENING_WINDOW_DAYS),
    seuil_consommation: CONSUMPTION_THRESHOLD_LABEL,
    delai_reponse_apprenant: pluralDays(LEARNER_RESPONSE_DEADLINE_DAYS),
    delai_suppression: pluralDays(DELETION_GRACE_DAYS),
    retrait_minimum: fmtFcfa(PAYOUT_MIN_AMOUNT_FCFA),
    carence_moyen_paiement: `${PAYOUT_METHOD_CARENCE_HOURS} h`,
    delai_support: `${responseHours} heures ouvrées`,
    // Une liste vide ne doit pas laisser une parenthèse ou une phrase creuse.
    operateurs: markets.brands.length ? markets.brands.join(', ') : 'selon votre pays',
    pays: markets.countries.length ? markets.countries.map((c) => c.name).join(', ') : 'les pays desservis',
  }
}

// --- Lecture publique -------------------------------------------------------

export interface PublicHelpArticle {
  id: string
  question: string
  answer: AnswerSegment[]
}

export interface PublicHelpCategory {
  slug: string
  title: string
  hint: string
  icon: HelpIconKey
  articles: PublicHelpArticle[]
}

const iconKey = (value: string): HelpIconKey =>
  (HELP_ICON_KEYS as readonly string[]).includes(value) ? (value as HelpIconKey) : 'book'

/** Le centre d'aide tel qu'un visiteur le lit : rubriques non vides, questions publiées. */
export async function listPublicHelp(values?: HelpValues): Promise<PublicHelpCategory[]> {
  const [rows, v] = await Promise.all([
    db.helpCategory.findMany({
      orderBy: { position: 'asc' },
      include: { articles: { where: { published: true }, orderBy: { position: 'asc' } } },
    }),
    values ? Promise.resolve(values) : loadHelpValues(),
  ])
  return rows
    .filter((c) => c.articles.length > 0)
    .map((c) => ({
      slug: c.slug,
      title: c.title,
      hint: c.hint,
      icon: iconKey(c.icon),
      articles: c.articles.map((a) => ({ id: a.id, question: a.question, answer: renderAnswer(a.answer, v) })),
    }))
}

/** La FAQ de l'accueil : les questions publiées cochées « accueil », dans l'ordre de l'aide. */
export async function listHomepageFaq(values?: HelpValues): Promise<PublicHelpArticle[]> {
  const [rows, v] = await Promise.all([
    db.helpArticle.findMany({
      where: { published: true, onHomepage: true },
      orderBy: [{ category: { position: 'asc' } }, { position: 'asc' }],
    }),
    values ? Promise.resolve(values) : loadHelpValues(),
  ])
  return rows.map((a) => ({ id: a.id, question: a.question, answer: renderAnswer(a.answer, v) }))
}

// --- Administration -----------------------------------------------------------

export type HelpEditorRole = 'SUPER_ADMIN' | 'MODERATION'
interface Actor { id: string; role: HelpEditorRole }

export interface CategoryInput { title: string; hint: string; icon: string; slug?: string }
export interface ArticleInput {
  categoryId: string
  question: string
  answer: string
  published: boolean
  onHomepage: boolean
}

function checkCategory(input: CategoryInput) {
  if (!input.title.trim()) throw new Error('HELP_TITLE_REQUIRED')
  if (!(HELP_ICON_KEYS as readonly string[]).includes(input.icon)) throw new Error('HELP_ICON_INVALID')
}

function checkArticle(input: ArticleInput) {
  if (!input.question.trim() || !input.answer.trim()) throw new Error('HELP_TEXT_REQUIRED')
  if (answerProblems(input.answer).length > 0) throw new Error('HELP_ANSWER_INVALID')
}

export async function createHelpCategory(input: CategoryInput, actor: Actor) {
  checkCategory(input)
  const base = slugify(input.slug?.trim() || input.title)
  return db.$transaction(async (tx) => {
    // L'ancre doit rester unique : « Paiements » puis « Paiements » donne
    // « paiements » et « paiements-2 ».
    let slug = base
    for (let n = 2; await tx.helpCategory.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`
    const last = await tx.helpCategory.aggregate({ _max: { position: true } })
    const created = await tx.helpCategory.create({
      data: {
        slug, title: input.title.trim(), hint: input.hint.trim(), icon: input.icon,
        position: (last._max.position ?? -1) + 1, updatedById: actor.id,
      },
    })
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role, action: 'HELP_CATEGORY_CREATED',
      targetType: 'HelpCategory', targetId: created.id, meta: { title: created.title },
    })
    return created
  })
}

export async function updateHelpCategory(id: string, input: CategoryInput, actor: Actor) {
  checkCategory(input)
  return db.$transaction(async (tx) => {
    const before = await tx.helpCategory.findUnique({ where: { id } })
    if (!before) throw new Error('HELP_NOT_FOUND')
    const updated = await tx.helpCategory.update({
      where: { id },
      data: { title: input.title.trim(), hint: input.hint.trim(), icon: input.icon, updatedById: actor.id },
    })
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role, action: 'HELP_CATEGORY_UPDATED',
      targetType: 'HelpCategory', targetId: id, meta: { from: before.title, to: updated.title },
    })
    return updated
  })
}

/** Une rubrique ne se supprime que vide : ses questions ne disparaissent pas par ricochet. */
export async function deleteHelpCategory(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const category = await tx.helpCategory.findUnique({ where: { id }, include: { _count: { select: { articles: true } } } })
    if (!category) throw new Error('HELP_NOT_FOUND')
    if (category._count.articles > 0) throw new Error('HELP_CATEGORY_NOT_EMPTY')
    await tx.helpCategory.delete({ where: { id } })
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role, action: 'HELP_CATEGORY_DELETED',
      targetType: 'HelpCategory', targetId: id, meta: { title: category.title },
    })
  })
}

export async function createHelpArticle(input: ArticleInput, actor: Actor) {
  checkArticle(input)
  return db.$transaction(async (tx) => {
    const category = await tx.helpCategory.findUnique({ where: { id: input.categoryId } })
    if (!category) throw new Error('HELP_NOT_FOUND')
    const last = await tx.helpArticle.aggregate({ where: { categoryId: input.categoryId }, _max: { position: true } })
    const created = await tx.helpArticle.create({
      data: {
        categoryId: input.categoryId, question: input.question.trim(), answer: input.answer.trim(),
        published: input.published, onHomepage: input.onHomepage,
        position: (last._max.position ?? -1) + 1, updatedById: actor.id,
      },
    })
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role, action: 'HELP_ARTICLE_CREATED',
      targetType: 'HelpArticle', targetId: created.id,
      meta: { question: created.question, published: created.published, onHomepage: created.onHomepage },
    })
    return created
  })
}

export async function updateHelpArticle(id: string, input: ArticleInput, actor: Actor) {
  checkArticle(input)
  return db.$transaction(async (tx) => {
    const before = await tx.helpArticle.findUnique({ where: { id } })
    if (!before) throw new Error('HELP_NOT_FOUND')
    const moved = before.categoryId !== input.categoryId
    let position = before.position
    if (moved) {
      if (!(await tx.helpCategory.findUnique({ where: { id: input.categoryId } }))) throw new Error('HELP_NOT_FOUND')
      // Changer de rubrique place la question à la fin de la nouvelle.
      const last = await tx.helpArticle.aggregate({ where: { categoryId: input.categoryId }, _max: { position: true } })
      position = (last._max.position ?? -1) + 1
    }
    const updated = await tx.helpArticle.update({
      where: { id },
      data: {
        categoryId: input.categoryId, question: input.question.trim(), answer: input.answer.trim(),
        published: input.published, onHomepage: input.onHomepage, position, updatedById: actor.id,
      },
    })
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role, action: 'HELP_ARTICLE_UPDATED',
      targetType: 'HelpArticle', targetId: id,
      meta: {
        question: updated.question,
        ...(before.published !== updated.published ? { published: updated.published } : {}),
        ...(before.onHomepage !== updated.onHomepage ? { onHomepage: updated.onHomepage } : {}),
        ...(moved ? { movedTo: input.categoryId } : {}),
        answerChanged: before.answer !== updated.answer,
      },
    })
    return updated
  })
}

export async function deleteHelpArticle(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const article = await tx.helpArticle.findUnique({ where: { id } })
    if (!article) throw new Error('HELP_NOT_FOUND')
    await tx.helpArticle.delete({ where: { id } })
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role, action: 'HELP_ARTICLE_DELETED',
      targetType: 'HelpArticle', targetId: id, meta: { question: article.question },
    })
  })
}

/**
 * Échange une rubrique ou une question avec sa voisine. Sans voisine dans ce
 * sens (déjà en tête, déjà en fin), rien ne bouge et rien n'est journalisé.
 */
export async function moveHelpItem(kind: 'category' | 'article', id: string, direction: 'up' | 'down', actor: Actor) {
  return db.$transaction(async (tx) => {
    const order = direction === 'up' ? ('desc' as const) : ('asc' as const)
    const beyond = (position: number) => (direction === 'up' ? { lt: position } : { gt: position })
    if (kind === 'category') {
      const item = await tx.helpCategory.findUnique({ where: { id } })
      if (!item) throw new Error('HELP_NOT_FOUND')
      const neighbour = await tx.helpCategory.findFirst({
        where: { position: beyond(item.position) },
        orderBy: { position: order },
      })
      if (!neighbour) return false
      await tx.helpCategory.update({ where: { id: item.id }, data: { position: neighbour.position } })
      await tx.helpCategory.update({ where: { id: neighbour.id }, data: { position: item.position } })
    } else {
      const item = await tx.helpArticle.findUnique({ where: { id } })
      if (!item) throw new Error('HELP_NOT_FOUND')
      const neighbour = await tx.helpArticle.findFirst({
        where: { categoryId: item.categoryId, position: beyond(item.position) },
        orderBy: { position: order },
      })
      if (!neighbour) return false
      await tx.helpArticle.update({ where: { id: item.id }, data: { position: neighbour.position } })
      await tx.helpArticle.update({ where: { id: neighbour.id }, data: { position: item.position } })
    }
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role,
      action: kind === 'category' ? 'HELP_CATEGORY_MOVED' : 'HELP_ARTICLE_MOVED',
      targetType: kind === 'category' ? 'HelpCategory' : 'HelpArticle', targetId: id, meta: { direction },
    })
    return true
  })
}

/** Tout le contenu, brouillons compris, pour l'écran d'administration. */
export async function listHelpForAdmin() {
  return db.helpCategory.findMany({
    orderBy: { position: 'asc' },
    include: { articles: { orderBy: { position: 'asc' } } },
  })
}
