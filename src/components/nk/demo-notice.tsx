import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bandeau signalant qu'un écran affiche des données de démonstration et n'est
 * pas encore branché sur la base. À retirer écran par écran au fil du
 * branchement — c'est le marqueur qui distingue « pas encore câblé » de
 * « câblé mais vide ».
 */
export function DemoNotice({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-nk-sm border border-gold/30 bg-gold-tint px-3.5 py-2.5 text-[13px] font-medium text-gold-ink",
        className,
      )}
    >
      <Info className="mt-px size-4 flex-none" aria-hidden="true" />
      <span>
        {children ??
          "Écran de démonstration : les données affichées ne viennent pas encore de la base."}
      </span>
    </p>
  );
}
