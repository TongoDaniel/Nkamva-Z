import Link from "next/link";
import { Search, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { auditActionLabel } from "@/lib/audit-labels";
import {
  AUDIT_ACTION_GROUPS,
  ACTOR_SYSTEM,
  ACTOR_HUMAN,
  type AuditActor,
} from "@/lib/audit-review";

const FIELD =
  "w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[13.5px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25";
const LABEL = "mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-ink-3";

export interface AuditFilterValues {
  q: string;
  action: string;
  acteur: string;
  du: string;
  au: string;
}

/**
 * Range les actions par domaine, dans l'ordre des onglets. Un menu de soixante
 * lignes à plat ne se lit pas ; les mêmes soixante lignes sous leur domaine se
 * parcourent comme la navigation qu'on vient de quitter.
 *
 * Le domaine se déduit des mêmes préfixes que les onglets — pas d'une seconde
 * table à tenir à jour, qui divergerait au premier ajout d'action.
 */
function byDomain(actions: string[]): Array<{ label: string; actions: string[] }> {
  const remaining = new Set(actions);
  const groups: Array<{ label: string; actions: string[] }> = [];

  for (const group of AUDIT_ACTION_GROUPS) {
    if (group.prefixes.length === 0) continue;
    const matched = actions.filter(
      (action) => remaining.has(action) && group.prefixes.some((p) => action.startsWith(p)),
    );
    if (matched.length === 0) continue;
    for (const action of matched) remaining.delete(action);
    groups.push({ label: group.label, actions: matched });
  }

  // Une action qu'aucun préfixe ne réclame existe quand même en base : la taire
  // la rendrait infiltrable. Elle atterrit ici, ce qui signale au passage un
  // groupe à compléter dans `audit-labels.ts`.
  if (remaining.size > 0) groups.push({ label: "Hors domaine", actions: [...remaining] });
  return groups;
}

export function AuditFilters({
  group,
  target,
  actions,
  actors,
  values,
  activeCount,
  resetHref,
}: {
  /** Reconduit en champ caché : filtrer ne doit pas ramener à l'onglet « Toutes ». */
  group: string;
  /** Idem pour le filtre sur un objet, qui a sa propre bande au-dessus. */
  target: string | null;
  actions: string[];
  actors: AuditActor[];
  values: AuditFilterValues;
  activeCount: number;
  resetHref: string;
}) {
  return (
    <form
      method="get"
      action="/admin/journal-audit"
      className="mb-5 rounded-nk-lg border border-line bg-card p-4.5 shadow-nk-sm"
      aria-label="Filtrer le journal"
    >
      <input type="hidden" name="groupe" value={group} />
      {target ? <input type="hidden" name="cible" value={target} /> : null}
      {/* Aucun champ `page` : changer un filtre doit ramener à la première page,
          sinon on atterrit sur une page 7 qui n'existe plus dans le résultat. */}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <label htmlFor="audit-q" className={LABEL}>
            Recherche
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <input
              id="audit-q"
              name="q"
              type="search"
              defaultValue={values.q}
              placeholder="Un libellé, un code d'action, un identifiant d'objet, un acteur…"
              maxLength={120}
              className={`${FIELD} pl-10`}
            />
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
            Cherche à la fois dans le libellé français, le code de l&apos;action,
            l&apos;identifiant de l&apos;objet et le nom ou l&apos;email de l&apos;acteur.
          </p>
        </div>

        <div>
          <label htmlFor="audit-action" className={LABEL}>
            Type d&apos;action
          </label>
          <select id="audit-action" name="action" defaultValue={values.action} className={FIELD}>
            <option value="">Tous les types</option>
            {byDomain(actions).map((domain) => (
              <optgroup key={domain.label} label={domain.label}>
                {domain.actions.map((action) => (
                  <option key={action} value={action}>
                    {auditActionLabel(action)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-acteur" className={LABEL}>
            Acteur
          </label>
          <select id="audit-acteur" name="acteur" defaultValue={values.acteur} className={FIELD}>
            <option value="">Tous les acteurs</option>
            {/* Les deux premières options répondent à la question qu'on se pose
                le plus souvent : ce qu'une personne a fait, par opposition au
                bruit des tâches planifiées. */}
            <option value={ACTOR_HUMAN}>Personnes identifiées</option>
            <option value={ACTOR_SYSTEM}>Système (tâches planifiées, webhooks)</option>
            {actors.length > 0 ? (
              <optgroup label="Comptes">
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.label}
                    {actor.role ? ` · ${actor.role}` : ""} ({actor.entries})
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>

        <div>
          <label htmlFor="audit-du" className={LABEL}>
            Du
          </label>
          <input id="audit-du" name="du" type="date" defaultValue={values.du} className={FIELD} />
        </div>

        <div>
          <label htmlFor="audit-au" className={LABEL}>
            Au (inclus)
          </label>
          <input id="audit-au" name="au" type="date" defaultValue={values.au} className={FIELD} />
        </div>

        <div className="flex items-end gap-3 md:col-span-2">
          <Btn type="submit" size="sm">
            Filtrer
          </Btn>
          {activeCount > 0 ? (
            <Btn asChild size="sm" variant="t">
              <Link href={resetHref}>
                <X className="size-3.5" aria-hidden="true" />
                Effacer {activeCount} filtre{activeCount > 1 ? "s" : ""}
              </Link>
            </Btn>
          ) : null}
        </div>
      </div>
    </form>
  );
}
