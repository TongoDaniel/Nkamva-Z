"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { Modal } from "@/components/nk/modal";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import {
  ADMIN_ROLE_CODES,
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  type AdminRoleCode,
} from "@/lib/admin-roles";

/** Plan d'action, section 2 : rôles cumulables, décrits par leur périmètre. */
export function CreateAdminForm() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [adminRoles, setAdminRoles] = React.useState<AdminRoleCode[]>(["SUPPORT"]);
  const toggle = (role: AdminRoleCode) =>
    setAdminRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const create = useAction(
    () =>
      api.post("/api/admin/admins", {
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        adminRoles,
      }),
    {
      success: `Compte créé (${adminRoles.map((r) => ADMIN_ROLE_LABELS[r]).join(", ")}). Un e-mail invite ${fullName.trim()} à choisir son mot de passe.`,
      // L'échec s'affiche au fil du formulaire, à côté des champs fautifs,
      // plutôt qu'en pastille au bas de l'écran.
      error: null,
      onSuccess: () => {
        setOpen(false);
        setEmail("");
        setFullName("");
        setAdminRoles(["SUPPORT"]);
      },
    },
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void create.run();
  }

  return (
    <Modal
      trigger={<Btn>Créer un administrateur</Btn>}
      open={open}
      onOpenChange={setOpen}
      title="Créer un administrateur"
      description="Le compte naît sans mot de passe : un e-mail invite la personne à en choisir un elle-même, via « Mot de passe oublié »."
      footer={
        <>
          <Btn type="submit" form="create-admin-form" loading={create.pending}>
            Créer et inviter
          </Btn>
          <Btn variant="o" disabled={create.pending} onClick={() => setOpen(false)}>
            Annuler
          </Btn>
        </>
      }
    >
      <form id="create-admin-form" onSubmit={onSubmit} noValidate>
        {create.error ? (
          <p role="alert" className="mb-4 rounded-xl border border-line bg-card border-l-4 border-l-danger px-4 py-3 text-[13.5px] font-semibold text-danger rounded-l-sm">
            {create.error}
          </p>
        ) : null}

        <Field
          label="Nom complet"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Prénom Nom"
          required
        />
        <Field
          label="Adresse e-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@nkamva.com"
          required
        />

        <fieldset className="mb-[18px]">
          <legend className="mb-1.5 text-[13.5px] font-bold text-ink">Rôles (cumulables)</legend>
          <div className="grid gap-2">
            {ADMIN_ROLE_CODES.map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 has-[:checked]:border-brand has-[:checked]:ring-1 has-[:checked]:ring-brand"
              >
                <input
                  type="checkbox"
                  checked={adminRoles.includes(role)}
                  onChange={() => toggle(role)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[14px] font-bold text-ink">{ADMIN_ROLE_LABELS[role]}</span>
                  <span className="block text-[13px] leading-relaxed text-ink-2">
                    {ADMIN_ROLE_DESCRIPTIONS[role]}
                    {role === "SUPER_ADMIN" ? " Deux personnes au plus ; ne se retire plus depuis cette console." : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
