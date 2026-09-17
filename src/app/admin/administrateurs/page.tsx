import type { Metadata } from "next";
import { userAvatarSrc } from "@/lib/avatars";
import { redirect } from "next/navigation";
import { UserCog } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { Avatar } from "@/components/nk/avatar";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { listAdmins, ADMIN_ROLE_LABELS } from "@/lib/admins";
import { fmtDate } from "@/lib/format";
import { CreateAdminForm } from "./create-admin-form";
import { AdminActions } from "./admin-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administrateurs",
  robots: { index: false },
};

export default async function AdministrateursPage() {
  const auth = await getAuthContext();
  // Toute la console de gestion des administrateurs est réservée au
  // Super-admin : c'est lui seul qui décide qui entre dans l'équipe.
  if (auth?.user.adminRole !== "SUPER_ADMIN") redirect("/admin");

  const admins = await listAdmins();

  return (
    <>
      <AdminHead
        title="Administrateurs"
        lead="Qui a accès à cette console, et avec quel sous-rôle. Le sous-rôle Super-admin est immuable ici : il ne se change ni ne se retire depuis cet écran, une fois posé."
        actions={<CreateAdminForm />}
      />

      <AdminCard title={`${admins.length} compte${admins.length > 1 ? "s" : ""}`}>
        {admins.length === 0 ? (
          <EmptyState icon={<UserCog />} title="Aucun administrateur" />
        ) : (
          <ul className="flex flex-col">
            {admins.map((admin) => {
              const name = admin.fullName ?? admin.email;
              const active = admin.suspendedAt == null;
              return (
                <li
                  key={admin.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-3.5 last:border-b-0"
                >
                  <Avatar name={name} src={userAvatarSrc(admin)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">{name}</b>
                    <small className="block truncate text-[13px] text-ink-3">{admin.email}</small>
                  </div>

                  <StPill tone={admin.adminRole === "SUPER_ADMIN" ? "info" : "muted"}>
                    {ADMIN_ROLE_LABELS[admin.adminRole]}
                  </StPill>

                  {active ? null : <StPill tone="bad">Compte fermé</StPill>}

                  <span className="text-[13px] text-ink-2">
                    Depuis le {fmtDate(admin.createdAt)}
                  </span>

                  {admin.adminRole === "SUPER_ADMIN" ? (
                    <span className="text-[13px] text-ink-3">Sous-rôle immuable</span>
                  ) : (
                    <AdminActions
                      userId={admin.id}
                      userName={name}
                      currentRole={admin.adminRole}
                      suspended={!active}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
