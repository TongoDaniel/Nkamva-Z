"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { Modal } from "@/components/nk/modal";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

type AdminRole = "SUPER_ADMIN" | "FINANCES" | "MODERATION";

const ROLE_OPTIONS: Array<{ value: AdminRole; label: string; hint: string }> = [
  { value: "MODERATION", label: "Modération", hint: "Candidatures formateur, litiges, signalements." },
  { value: "FINANCES", label: "Finances", hint: "Transactions, retraits, moyens de paiement, lecture des comptes." },
  {
    value: "SUPER_ADMIN",
    label: "Super-admin",
    hint: "Accès complet. Une fois créé, ce sous-rôle ne peut plus être changé ni retiré depuis cette console.",
  },
];

export function CreateAdminForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [adminRole, setAdminRole] = React.useState<AdminRole>("MODERATION");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post("/api/admin/admins", {
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        adminRole,
      });
      toast.success(
        `Compte ${ROLE_OPTIONS.find((r) => r.value === adminRole)?.label} créé. Un e-mail invite ${fullName.trim()} à choisir son mot de passe.`,
      );
      setOpen(false);
      setEmail("");
      setFullName("");
      setAdminRole("MODERATION");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "La création a échoué.");
    } finally {
      setPending(false);
    }
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
          <Btn type="submit" form="create-admin-form" loading={pending}>
            Créer et inviter
          </Btn>
          <Btn variant="o" onClick={() => setOpen(false)}>
            Annuler
          </Btn>
        </>
      }
    >
      <form id="create-admin-form" onSubmit={onSubmit} noValidate>
        {error ? (
          <p role="alert" className="mb-4 rounded-xl bg-danger-tint px-4 py-3 text-[13.5px] font-semibold text-danger">
            {error}
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
          <legend className="mb-1.5 text-[13.5px] font-bold text-ink">Sous-rôle</legend>
          <div className="grid gap-2">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-tint"
              >
                <input
                  type="radio"
                  name="adminRole"
                  value={option.value}
                  checked={adminRole === option.value}
                  onChange={() => setAdminRole(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[14px] font-bold text-ink">{option.label}</span>
                  <span className="block text-[12.5px] leading-relaxed text-ink-2">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
