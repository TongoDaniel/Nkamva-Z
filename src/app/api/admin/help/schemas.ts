// Aide & FAQ — corps de requête des routes d'administration.
// Hors des `route.ts` : un fichier de route n'exporte que ses verbes HTTP.
import { z } from 'zod'

export const CategorySchema = z.object({
  title: z.string().trim().min(1).max(80),
  hint: z.string().trim().max(120),
  icon: z.string().trim().min(1).max(40),
})

export const ArticleSchema = z.object({
  categoryId: z.string().trim().min(1),
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(4000),
  published: z.boolean(),
  onHomepage: z.boolean(),
})

export const MoveSchema = z.object({ direction: z.enum(['up', 'down']) })
