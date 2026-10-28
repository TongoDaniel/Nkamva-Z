import Link from "next/link";

/**
 * Décision 30 — un écart de nom ne se solde jamais par un rejet opaque. Le
 * message dit ce qui bloque, rappelle les deux seules configurations
 * légitimes, et ouvre une porte vers le support.
 *
 * Il n'affiche **jamais** le nom légal vérifié : ni ici, ni ailleurs dans
 * l'espace formateur — la sélection Prisma exposée au formateur
 * (`TRAINER_METHOD_SELECT`) ne le contient pas, ce qui rend la fuite
 * structurellement impossible plutôt que simplement évitée.
 */
export function NameMismatchNotice({ reason }: { reason?: string | null }) {
  return (
    <div className="mb-6 rounded-nk-lg border border-danger/30 bg-danger/5 p-5">
      <h2 className="text-[14.5px] font-extrabold text-ink">
        Le titulaire du compte ne correspond pas à votre identité vérifiée
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
        Le nom associé au compte que vous avez enregistré ne correspond pas à celui de la
        pièce d&apos;identité validée lors de votre candidature. Nous ne pouvons pas verser
        vos revenus sur un compte dont vous n&apos;êtes pas le titulaire.
        {reason ? <> {reason}</> : null}
      </p>

      <p className="mt-4 text-[13px] font-bold text-ink">Deux configurations sont acceptées :</p>
      <ul className="mt-1.5 grid gap-1.5 text-[13px] leading-relaxed text-ink-2">
        <li>
          <b className="font-bold text-ink">Un compte personnel</b> ouvert à votre nom, tel
          qu&apos;il figure sur votre pièce d&apos;identité.
        </li>
        <li>
          <b className="font-bold text-ink">Un compte d&apos;entreprise</b> dont vous êtes le
          représentant légal, avec le document d&apos;immatriculation et la preuve de votre
          qualité.
        </li>
      </ul>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
        Aucune autre situation n&apos;est acceptée, quel que soit le lien avec le titulaire.
        Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur (un nom d&apos;usage, une
        transcription différente),{" "}
        <Link href="/contact" className="font-bold text-brand">
          contactez le support
        </Link>
        , qui peut réexaminer votre dossier.
      </p>
    </div>
  );
}
