import type { Metadata } from 'next'
import { Clock, Mail, MessageSquare } from 'lucide-react'
import { PageHead } from '@/components/nk/page-head'
import { ContactForm } from './contact-form'

export const metadata: Metadata = {
  title: 'Contact — NkamVa',
  description: "Écrivez à l'équipe NkamVa : support, partenariats, presse.",
}

const CHANNELS = [
  { icon: Mail, title: 'Support', description: 'support@nkamva.com — réponse sous 24 h ouvrées' },
  { icon: MessageSquare, title: 'Partenariats', description: 'partenaires@nkamva.com' },
  { icon: Clock, title: 'Horaires', description: 'Du lundi au vendredi, 8 h – 18 h (GMT+1)' },
]

export default function ContactPage() {
  return (
    <div className="wrap max-w-[980px]">
      <PageHead
        crumbs={[{ label: 'Accueil', href: '/' }, { label: 'Contact' }]}
        title="Nous écrire"
        lead="Une question sur un achat, un litige, une candidature formateur ? Écrivez-nous, nous répondons en français."
      />

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_300px]">
        <ContactForm />

        <aside className="grid gap-3">
          {CHANNELS.map(channel => (
            <div key={channel.title} className="rounded-xl border border-line bg-card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-t text-brand">
                <channel.icon className="size-5" />
              </span>
              <h2 className="mt-3 text-base font-bold">{channel.title}</h2>
              <p className="mt-1 text-[13.5px] leading-[1.5] text-ink2">{channel.description}</p>
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}
