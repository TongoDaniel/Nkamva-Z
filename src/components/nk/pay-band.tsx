import Image from 'next/image'
import { cn } from '@/lib/utils'

const METHODS = [
  { src: '/pay/orange-money.svg', alt: 'Orange Money', className: 'bg-black border-black', imgClass: 'h-[23px]' },
  { src: '/pay/mtn.svg', alt: 'MTN MoMo', className: 'bg-[#ffcb05] border-[#eec000]', imgClass: 'h-[19px]' },
  { src: '/pay/wave.png', alt: 'Wave', className: 'bg-white', imgClass: 'h-[23px]' },
  { src: '/pay/airtel.svg', alt: 'Airtel Money', className: 'bg-white', imgClass: 'h-[19px]' },
  { src: '/pay/m-pesa.png', alt: 'M-Pesa', className: 'bg-white', imgClass: 'h-[19px]' },
]

function Pill({ method, hidden }: { method: (typeof METHODS)[number]; hidden?: boolean }) {
  return (
    <span
      aria-hidden={hidden}
      className={cn(
        'flex h-[46px] flex-none items-center gap-2 whitespace-nowrap rounded-[13px] border border-line px-5',
        method.className,
      )}
    >
      <Image
        src={method.src}
        alt={hidden ? '' : method.alt}
        width={90}
        height={24}
        className={cn('w-auto', method.imgClass)}
      />
    </span>
  )
}

function CardPill({ hidden }: { hidden?: boolean }) {
  return (
    <span
      aria-hidden={hidden}
      className="flex h-[46px] flex-none items-center whitespace-nowrap rounded-[13px] border border-line bg-white px-5 text-[13.5px] font-bold tracking-[0.02em] text-ink2"
    >
      Carte bancaire
    </span>
  )
}

/** Frise défilante des moyens de paiement acceptés (`.payband`). */
export function PayBand() {
  return (
    <section className="border-y border-line bg-card">
      <div className="wrap flex flex-col items-start gap-3.5 py-5 sm:flex-row sm:items-center sm:gap-[26px]">
        <p className="flex-none max-w-[150px] text-xs font-bold uppercase leading-[1.5] tracking-[0.12em] text-ink3">
          Paiements acceptés
        </p>
        <div className="nk-marquee-wrap nk-marquee-mask w-full min-w-0 flex-1 overflow-hidden">
          <div className="nk-marquee items-center gap-3" style={{ '--speed': '30s' } as React.CSSProperties}>
            {METHODS.map(m => (
              <Pill key={m.alt} method={m} />
            ))}
            <CardPill />
            {METHODS.map(m => (
              <Pill key={`${m.alt}-dup`} method={m} hidden />
            ))}
            <CardPill hidden />
          </div>
        </div>
      </div>
      <p className="wrap pb-4.5 text-[13px] font-medium text-ink3">
        <b className="font-bold text-ink2">Disponible :</b> Cameroun · Sénégal · Côte d&apos;Ivoire · Bénin · Mali ·
        Burkina Faso · Togo · Gabon · RDC · Kenya
      </p>
    </section>
  )
}
