-- Application mobile : un jeton se révoque à la déconnexion.
CREATE TABLE "revoked_mobile_tokens" (
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_mobile_tokens_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "revoked_mobile_tokens_expiresAt_idx" ON "revoked_mobile_tokens"("expiresAt");
