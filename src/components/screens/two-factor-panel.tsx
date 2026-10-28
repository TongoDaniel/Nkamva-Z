"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ShieldCheck, ShieldAlert } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Hint } from "@/components/nk/hint";
import { StPill } from "@/components/nk/status-pill";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

interface Status {
  enabled: boolean;
  pending: boolean;
  remainingRecoveryCodes: number;
  required: boolean;
}

const field =
  "w-full rounded-nk border border-line bg-paper px-3.5 py-2.5 text-[15px] tracking-[0.2em] tabular-nums outline-none focus-visible:border-brand";

const passwordField =
  "w-full rounded-nk border border-line bg-paper px-3.5 py-2.5 text-[15px] outline-none focus-visible:border-brand";

/** Les codes de secours ne sont montrés qu'une fois : cet écran est le seul. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const text = codes.join("\n");

  return (
    <div className="grid gap-4">
      <div className="rounded-nk border border-line bg-card border-l-4 border-l-gold px-4 py-3 text-[13.5px] leading-relaxed text-ink-2 rounded-l-sm">
        <b className="text-ink">Conservez ces dix codes maintenant.</b> Ils ne seront plus jamais
        affichés. Chacun ne sert qu&apos;une fois, et c&apos;est votre seule porte de secours si vous
        perdez votre téléphone.
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-nk border border-line bg-paper p-4 font-mono text-[14px] tabular-nums">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Btn
          variant="o"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success("Codes copiés.");
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          Copier les codes
        </Btn>
        <Btn onClick={onDone}>Je les ai mis en lieu sûr</Btn>
      </div>
    </div>
  );
}

/**
 * Activation de la double authentification.
 *
 * Le SMS n'est pas proposé, et c'est un choix : la plateforme porte des
 * portefeuilles et des retraits, or l'échange de carte SIM vise précisément les
 * comptes adossés au mobile money. Le SMS sert à alerter, pas à authentifier.
 */
export function TwoFactorPanel({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = React.useState(initial);
  const [setup, setSetup] = React.useState<{ qr: string; secret: string } | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const action = useKeyedAction();

  /**
   * `refresh` reste faux par défaut : trois de ces quatre gestes ne font
   * qu'avancer l'assistant sans rien changer au rendu serveur — c'est la sortie
   * des codes de secours qui, elle, relit la page.
   */
  function run<T>(
    key: string,
    fn: () => Promise<T>,
    onOk: (value: T) => void,
    options: { success?: string; refresh?: boolean } = {},
  ) {
    void action.run(key, fn, {
      success: options.success ?? null,
      error: "L'opération n'a pas abouti.",
      refresh: options.refresh ?? false,
      onSuccess: onOk,
    });
  }

  if (codes) {
    return (
      <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
        <h2 className="mb-4 text-[17px] font-extrabold">Vos codes de secours</h2>
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
            setSetup(null);
            setCode("");
            setStatus((s) => ({ ...s, enabled: true, pending: false, remainingRecoveryCodes: 10 }));
            router.refresh();
          }}
        />
      </section>
    );
  }

  return (
    <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
      <div className="mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
          {status.enabled ? (
            <ShieldCheck className="size-[19px] text-brand" aria-hidden="true" />
          ) : (
            <ShieldAlert className="size-[19px] text-ink-3" aria-hidden="true" />
          )}
          Double authentification
        </h2>
        {/* Ce qu'est un code à six chiffres se lit une fois (arbitrage 138). La
            pastille d'état, elle, reste à côté du titre : c'est une donnée. */}
        <Hint label="Comment fonctionne la double authentification">
          Un code à six chiffres, généré par une application sur votre téléphone, sera
          demandé à chaque connexion. Il fonctionne sans réseau ni crédit.
        </Hint>
        {status.enabled ? (
          <StPill tone="ok">Active</StPill>
        ) : status.required ? (
          <StPill tone="bad">Requise pour votre rôle</StPill>
        ) : (
          <StPill tone="muted">Inactive</StPill>
        )}
      </div>

      {status.enabled ? (
        <div className="grid gap-4">
          <p className="text-[13.5px] text-ink-2">
            Il vous reste{" "}
            <b className="text-ink">
              {status.remainingRecoveryCodes} code
              {status.remainingRecoveryCodes > 1 ? "s" : ""} de secours
            </b>
            .{" "}
            {status.remainingRecoveryCodes <= 3
              ? "Pensez à en régénérer une série."
              : null}
          </p>

          <label className="grid max-w-[280px] gap-1.5">
            <span className="text-[13px] font-bold">
              Code de votre application, ou code de secours
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="123456"
              className={field}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Btn
              variant="o"
              loading={action.isRunning("regenerate")}
              disabled={!code.trim()}
              onClick={() =>
                run(
                  "regenerate",
                  () =>
                    api.post<{ recoveryCodes: string[] }>("/api/me/2fa", {
                      action: "regenerate",
                      code: code.trim(),
                    }),
                  ({ data }) => setCodes(data.recoveryCodes),
                )
              }
            >
              Régénérer les codes de secours
            </Btn>
            <Btn
              variant="danger"
              loading={action.isRunning("disable")}
              disabled={!code.trim()}
              onClick={() =>
                run(
                  "disable",
                  () => api.del("/api/me/2fa", { body: JSON.stringify({ code: code.trim() }) }),
                  () => {
                    setCode("");
                    setStatus((s) => ({ ...s, enabled: false, remainingRecoveryCodes: 0 }));
                  },
                  { success: "Double authentification désactivée.", refresh: true },
                )
              }
            >
              Désactiver
            </Btn>
          </div>
        </div>
      ) : setup ? (
        <div className="grid gap-4">
          <ol className="grid gap-3 text-[14px] leading-relaxed text-ink-2">
            <li>
              <b className="text-ink">1.</b> Scannez ce code avec votre application
              d&apos;authentification.
            </li>
          </ol>

          <Image
            src={setup.qr}
            alt="Code QR d'enrôlement"
            width={200}
            height={200}
            unoptimized
            className="rounded-nk border border-line bg-white p-2"
          />

          <details className="text-[13px] text-ink-2">
            <summary className="cursor-pointer font-semibold">
              Le code ne se scanne pas ? Saisir la clé à la main
            </summary>
            <code className="mt-2 block break-all rounded-nk-sm bg-paper px-3 py-2 font-mono text-[13px]">
              {setup.secret}
            </code>
          </details>

          <label className="grid max-w-[280px] gap-1.5">
            <span className="text-[13px] font-bold">
              2. Saisissez le code affiché par l&apos;application
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className={field}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Btn
              loading={action.isRunning("enable")}
              disabled={code.trim().length < 6}
              onClick={() =>
                run(
                  "enable",
                  () =>
                    api.post<{ recoveryCodes: string[] }>("/api/me/2fa", {
                      action: "enable",
                      code: code.trim(),
                    }),
                  ({ data }) => setCodes(data.recoveryCodes),
                )
              }
            >
              Activer
            </Btn>
            <Btn variant="t" onClick={() => { setSetup(null); setCode(""); }}>
              Annuler
            </Btn>
          </div>
        </div>
      ) : (
        // Le mot de passe est redemandé : une session ouverte sur un poste
        // laissé sans surveillance ne doit pas suffire à lier un autre téléphone.
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!password) return;
            run(
              "setup",
              () =>
                api.post<{ qr: string; secret: string; uri: string }>("/api/me/2fa", {
                  action: "setup",
                  currentPassword: password,
                }),
              ({ data }) => {
                setPassword("");
                setSetup({ qr: data.qr, secret: data.secret });
              },
            );
          }}
        >
          <label className="grid max-w-[320px] gap-1.5">
            <span className="text-[13px] font-bold">Votre mot de passe actuel</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={passwordField}
            />
          </label>
          <div>
            <Btn type="submit" loading={action.isRunning("setup")} disabled={!password}>
              <ShieldCheck aria-hidden="true" />
              Activer la double authentification
            </Btn>
          </div>
        </form>
      )}
    </section>
  );
}
