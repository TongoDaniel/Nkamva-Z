import { Brand } from '@/components/layout/brand'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-12">
      <Brand />
      <main className="w-full max-w-md">{children}</main>
    </div>
  )
}
