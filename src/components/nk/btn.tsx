import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Bouton de la maquette (`.btn`) : pilule, 600, léger enfoncement au clic.
 * Distinct du `Button` shadcn, qui reste utilisé dans les dialogues et menus.
 */
const btnVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-[1.5px] border-transparent font-semibold leading-none transition-[transform,box-shadow,background-color,border-color] duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[17px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white hover:bg-brand-d hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(28,94,208,.3)]',
        dark: 'bg-ink text-paper hover:bg-black hover:text-white hover:-translate-y-px',
        outline: 'bg-card text-ink border-line hover:border-ink',
        tint: 'bg-transparent text-brand hover:bg-brand-t',
        light: 'bg-white text-navy hover:bg-paper hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,.3)]',
        ghostOnDark: 'bg-transparent text-white border-white/30 hover:border-white',
      },
      size: {
        sm: 'h-[34px] px-4 text-[13.5px]',
        default: 'h-[42px] px-[22px] text-[15px]',
        lg: 'h-[50px] px-7 text-[16px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export interface BtnProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof btnVariants> {
  asChild?: boolean
}

export function Btn({ className, variant, size, asChild = false, ...props }: BtnProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(btnVariants({ variant, size }), className)} {...props} />
}

export { btnVariants }
