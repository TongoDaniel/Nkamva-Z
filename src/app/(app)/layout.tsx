import { redirect } from "next/navigation";
import { AppShell } from "@/components/layouts/app-shell";
import { getAuthContext } from "@/lib/api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Doublon volontaire du middleware : si la garde de navigation est un jour
  // désactivée, aucune page de l'espace connecté ne doit rester accessible.
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/connexion");

  return <AppShell>{children}</AppShell>;
}
