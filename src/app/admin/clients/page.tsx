import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { canOpen } from "@/lib/admin-roles";
import { getAuthContext } from "@/lib/api";
import { findCustomers } from "@/lib/customer-card";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fiche client", robots: { index: false } };

/** Plan d'action 0.13 : retrouver un client par e-mail, nom, téléphone ou identifiant. */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const auth = await getAuthContext();
  if (!canOpen(auth?.user, "customers")) redirect("/admin");
  const q = (await searchParams).q?.trim() ?? "";
  const results = q ? await findCustomers(q) : [];

  return (
    <>
      <AdminHead
        title="Fiche client"
        lead="Compte, achats, accès, paiements, litiges et reçus d'un client, sur un seul écran."
      />
      <AdminCard>
        <form action="/admin/clients" className="mb-5 flex flex-wrap gap-2">
          <label htmlFor="q" className="sr-only">Rechercher un client</label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="E-mail, nom, téléphone ou identifiant"
            className="min-w-0 flex-1 rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px]"
          />
          <button type="submit" className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-bold text-paper">
            Rechercher
          </button>
        </form>
        {q && results.length === 0 ? (
          <p className="text-[14px] text-ink-2">Aucun client ne correspond à « {q} ».</p>
        ) : (
          <ul className="flex flex-col">
            {results.map((u) => (
              <li key={u.id} className="border-b border-line-2 py-3 last:border-b-0">
                <Link href={`/admin/clients/${u.id}`} className="font-bold text-ink hover:underline">
                  {u.fullName ?? u.email}
                </Link>
                <span className="ml-2 text-[13px] text-ink-3">
                  {u.email} · {u.role === "TRAINER" ? "Formateur" : "Apprenant"} · inscrit le {fmtDate(u.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
