import type { NextResponse } from 'next/server'
import { error } from '@/lib/api'
import type { OtpFailure } from '@/lib/otp'

/** Mapping commun des échecs OTP pour `verify-otp` et `reset-password`. */
export function otpFailureResponse(reason: OtpFailure): NextResponse {
  switch (reason) {
    case 'OTP_EXPIRED':
      return error('OTP_EXPIRED', 'Code expiré. Demandez-en un nouveau.', 422)
    case 'OTP_TOO_MANY_ATTEMPTS':
      return error('OTP_TOO_MANY_ATTEMPTS', 'Trop de tentatives sur ce code. Demandez-en un nouveau.', 422)
    default:
      return error('OTP_INVALID', 'Code invalide', 422)
  }
}
