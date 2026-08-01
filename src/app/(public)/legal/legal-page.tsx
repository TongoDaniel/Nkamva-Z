import ReactMarkdown from 'react-markdown'
import { PageHead } from '@/components/nk/page-head'

/**
 * Gabarit commun des pages légales. Le texte vit en Markdown dans
 * `src/content/legal/` : il est relu et amendé par des juristes, pas par des devs.
 */
export function LegalPage({
  title,
  lead,
  content,
}: {
  title: string
  lead?: string
  content: string
}) {
  return (
    <div className="wrap max-w-[860px]">
      <PageHead crumbs={[{ label: 'Accueil', href: '/' }, { label: title }]} title={title} lead={lead} />

      <article
        className="mt-8 pb-4 [&_a]:font-semibold [&_a]:text-brand [&_a:hover]:underline [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-[21px] [&_h2]:font-extrabold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-[17px] [&_h3]:font-bold [&_li]:mb-1.5 [&_li]:leading-[1.65] [&_li]:text-ink2 [&_p]:mb-3 [&_p]:leading-[1.7] [&_p]:text-ink2 [&_strong]:font-bold [&_strong]:text-ink [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5"
      >
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>
    </div>
  )
}
