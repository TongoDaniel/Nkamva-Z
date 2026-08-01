'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

/** Champ de formulaire d'authentification (`.afield`), avec œil sur les mots de passe. */
export function AuthField({ label, hint, error, className, type = 'text', id, ...props }: AuthFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const isPassword = type === 'password'
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="mb-[18px]">
      <label htmlFor={fieldId} className="mb-1.5 block text-[13.5px] font-bold text-ink">
        {label}
      </label>

      <div className="relative">
        <input
          id={fieldId}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={!!error}
          className={cn(
            'w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink3 focus:border-brand',
            isPassword && 'pr-11',
            error && 'border-danger',
            className,
          )}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed(r => !r)}
            aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute inset-y-1 right-1 grid w-[38px] place-items-center rounded-lg text-ink3 hover:text-ink"
          >
            {revealed ? <EyeOff className="size-[19px]" /> : <Eye className="size-[19px]" />}
          </button>
        )}
      </div>

      {error ? (
        <p className="mt-1.5 text-[12.5px] font-medium text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-[12.5px] text-ink3">{hint}</p>
      )}
    </div>
  )
}
