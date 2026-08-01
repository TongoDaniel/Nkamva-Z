'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Btn } from '@/components/nk/btn'
import { DemoNotice } from '@/components/nk/demo-notice'

const SUBJECTS = [
  'Question sur un achat',
  'Problème d’accès à une ressource',
  'Candidature formateur',
  'Signalement de contenu',
  'Autre',
]

const fieldClass =
  'w-full rounded-2xl border-[1.5px] border-line bg-card px-4 py-3 text-[15px] text-ink outline-none transition focus:border-brand placeholder:text-ink3'

/**
 * Formulaire de contact. `/api/contact` est déclarée publique dans `api.ts` mais la
 * route n'existe pas encore : l'envoi est simulé tant qu'elle n'est pas écrite.
 */
export function ContactForm() {
  const [pending, setPending] = useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setTimeout(() => {
      toast.success('Message enregistré (démonstration — aucun envoi réel)')
      setPending(false)
    }, 400)
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-card p-6">
      <DemoNotice className="mb-5">
        Le formulaire n&apos;envoie rien : la route <code>/api/contact</code> reste à écrire.
      </DemoNotice>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Nom complet</span>
          <input name="name" required className={fieldClass} autoComplete="name" />
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Adresse email</span>
          <input name="email" type="email" required className={fieldClass} autoComplete="email" />
        </label>
      </div>

      <label className="mt-4 grid gap-1.5">
        <span className="text-sm font-semibold">Sujet</span>
        <select name="subject" className={fieldClass} defaultValue={SUBJECTS[0]}>
          {SUBJECTS.map(subject => (
            <option key={subject}>{subject}</option>
          ))}
        </select>
      </label>

      <label className="mt-4 grid gap-1.5">
        <span className="text-sm font-semibold">Votre message</span>
        <textarea name="message" required rows={6} className={fieldClass} />
      </label>

      <Btn type="submit" size="lg" className="mt-5 w-full sm:w-auto" disabled={pending}>
        {pending ? 'Envoi…' : 'Envoyer le message'}
      </Btn>
    </form>
  )
}
