'use client'

import { cn } from '@/lib/utils'

/** Saisie du code à 6 chiffres : un seul champ, lettrage espacé comme la maquette. */
export function OtpInput({
  value,
  onChange,
  disabled,
  label = 'Code de vérification',
  id = 'otp',
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label?: string
  id?: string
}) {
  return (
    <div className="mb-[18px]">
      <label htmlFor={id} className="mb-1.5 block text-[13.5px] font-bold text-ink">
        {label}
      </label>
      <input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        disabled={disabled}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder="••••••"
        className={cn(
          'w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-center font-display text-[22px] font-extrabold tracking-[0.5em] text-ink outline-none transition placeholder:tracking-[0.4em] placeholder:text-line focus:border-brand',
        )}
      />
    </div>
  )
}
