export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} NkamVa</p>
        <p>Plateforme de formation en ligne — cours, communautés et formateurs.</p>
      </div>
    </footer>
  )
}
