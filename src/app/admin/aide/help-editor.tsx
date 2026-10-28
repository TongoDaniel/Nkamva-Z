"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Home, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminCard } from "@/components/layouts/admin-shell";
import { Btn } from "@/components/nk/button";
import { EmptyState } from "@/components/nk/empty-state";
import { HELP_ICONS, HelpAnswer } from "@/components/nk/help-answer";
import { CheckOption, Field } from "@/components/nk/input";
import { Modal } from "@/components/nk/modal";
import { StPill } from "@/components/nk/status-pill";
import { actionErrorMessage, useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import {
  HELP_ICON_KEYS,
  HELP_ICON_LABELS,
  HELP_MARKERS,
  answerProblems,
  renderAnswer,
  type HelpIconKey,
  type HelpMarker,
  type HelpValues,
} from "@/lib/help-text";
import { cn } from "@/lib/utils";

interface EditorArticle {
  id: string;
  question: string;
  answer: string;
  published: boolean;
  onHomepage: boolean;
}

interface EditorCategory {
  id: string;
  slug: string;
  title: string;
  hint: string;
  icon: string;
  articles: EditorArticle[];
}

type Dialog =
  | { kind: "category"; category: EditorCategory | null }
  | { kind: "article"; article: EditorArticle | null; categoryId: string }
  | { kind: "delete-category"; category: EditorCategory }
  | { kind: "delete-article"; article: EditorArticle }
  | null;

const ICON_BTN =
  "nk-tap grid size-8 cursor-pointer place-items-center rounded-nk-sm text-ink-2 transition hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-35";

export function HelpEditor({ categories, values }: { categories: EditorCategory[]; values: HelpValues }) {
  const action = useKeyedAction();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const close = () => setDialog(null);

  const move = (kind: "categories" | "articles", id: string, direction: "up" | "down") =>
    void action.run(`move-${id}-${direction}`, () => api.post(`/api/admin/help/${kind}/${id}/move`, { direction }));

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2.5">
        <Btn
          size="sm"
          onClick={() => setDialog({ kind: "article", article: null, categoryId: categories[0]?.id ?? "" })}
          disabled={categories.length === 0}
        >
          <Plus aria-hidden="true" />
          Nouvelle question
        </Btn>
        <Btn size="sm" variant="o" onClick={() => setDialog({ kind: "category", category: null })}>
          <Plus aria-hidden="true" />
          Nouvelle rubrique
        </Btn>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="Aucune rubrique"
          description="Créez une première rubrique ; ses questions publiées s'afficheront sur /aide."
        />
      ) : null}

      <div className="grid gap-5">
        {categories.map((category, ci) => {
          const Icon = HELP_ICONS[category.icon as HelpIconKey] ?? HELP_ICONS.book;
          return (
            <AdminCard
              key={category.id}
              title={category.title}
              action={
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className={ICON_BTN}
                    disabled={ci === 0 || action.busy}
                    onClick={() => move("categories", category.id, "up")}
                    aria-label={`Monter la rubrique « ${category.title} »`}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    disabled={ci === categories.length - 1 || action.busy}
                    onClick={() => move("categories", category.id, "down")}
                    aria-label={`Descendre la rubrique « ${category.title} »`}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    onClick={() => setDialog({ kind: "category", category })}
                    aria-label={`Modifier la rubrique « ${category.title} »`}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    onClick={() => setDialog({ kind: "delete-category", category })}
                    aria-label={`Supprimer la rubrique « ${category.title} »`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              }
            >
              <p className="-mt-2.5 mb-4 flex items-center gap-2 text-[13px] text-ink-3">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {category.hint || "Sans sous-titre"} · ancre <code>/aide#{category.slug}</code>
              </p>

              {category.articles.length === 0 ? (
                <p className="text-[13.5px] text-ink-3">Aucune question : la rubrique n&apos;apparaît pas sur le site.</p>
              ) : (
                <ol className="divide-y divide-line-2 border-y border-line-2">
                  {category.articles.map((article, ai) => (
                    <li key={article.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                      <span className={cn("min-w-0 flex-1 basis-[220px] text-[14px] font-semibold", !article.published && "text-ink-3")}>
                        {article.question}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {!article.published ? (
                          <StPill tone="muted">
                            <EyeOff className="size-3" aria-hidden="true" /> Masquée
                          </StPill>
                        ) : null}
                        {article.onHomepage ? (
                          <StPill tone="info">
                            <Home className="size-3" aria-hidden="true" /> Accueil
                          </StPill>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className={ICON_BTN}
                          disabled={ai === 0 || action.busy}
                          onClick={() => move("articles", article.id, "up")}
                          aria-label={`Monter « ${article.question} »`}
                        >
                          <ArrowUp className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={ICON_BTN}
                          disabled={ai === category.articles.length - 1 || action.busy}
                          onClick={() => move("articles", article.id, "down")}
                          aria-label={`Descendre « ${article.question} »`}
                        >
                          <ArrowDown className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={ICON_BTN}
                          onClick={() => setDialog({ kind: "article", article, categoryId: category.id })}
                          aria-label={`Modifier « ${article.question} »`}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={ICON_BTN}
                          onClick={() => setDialog({ kind: "delete-article", article })}
                          aria-label={`Supprimer « ${article.question} »`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <Btn
                size="sm"
                variant="t"
                className="mt-3"
                onClick={() => setDialog({ kind: "article", article: null, categoryId: category.id })}
              >
                <Plus aria-hidden="true" />
                Ajouter une question ici
              </Btn>
            </AdminCard>
          );
        })}
      </div>

      {dialog?.kind === "category" ? (
        <CategoryDialog category={dialog.category} onClose={close} action={action} />
      ) : null}
      {dialog?.kind === "article" ? (
        <ArticleDialog
          article={dialog.article}
          categoryId={dialog.categoryId}
          categories={categories}
          values={values}
          onClose={close}
          action={action}
        />
      ) : null}
      {dialog?.kind === "delete-category" ? (
        <ConfirmDialog
          title={`Supprimer la rubrique « ${dialog.category.title} » ?`}
          description={
            dialog.category.articles.length > 0
              ? `Elle contient encore ${dialog.category.articles.length} question(s) : déplacez-les ou supprimez-les d'abord.`
              : "Elle est vide. Sa suppression est définitive."
          }
          disabled={dialog.category.articles.length > 0}
          running={action.isRunning("delete")}
          onConfirm={() =>
            void action.run("delete", () => api.del(`/api/admin/help/categories/${dialog.category.id}`), {
              success: "Rubrique supprimée.",
              onSuccess: close,
            })
          }
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "delete-article" ? (
        <ConfirmDialog
          title="Supprimer cette question ?"
          description={`« ${dialog.article.question} » disparaîtra du centre d'aide${dialog.article.onHomepage ? " et de l'accueil" : ""}. Pour la retirer sans la perdre, masquez-la plutôt.`}
          running={action.isRunning("delete")}
          onConfirm={() =>
            void action.run("delete", () => api.del(`/api/admin/help/articles/${dialog.article.id}`), {
              success: "Question supprimée.",
              onSuccess: close,
            })
          }
          onClose={close}
        />
      ) : null}
    </>
  );
}

type Action = ReturnType<typeof useKeyedAction>;

function CategoryDialog({ category, onClose, action }: { category: EditorCategory | null; onClose: () => void; action: Action }) {
  const [title, setTitle] = React.useState(category?.title ?? "");
  const [hint, setHint] = React.useState(category?.hint ?? "");
  const [icon, setIcon] = React.useState<string>(category?.icon ?? "book");
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    if (!title.trim()) return setError("Une rubrique a besoin d'un titre.");
    const body = { title, hint, icon };
    void action.run(
      "category",
      () => (category ? api.patch(`/api/admin/help/categories/${category.id}`, body) : api.post("/api/admin/help/categories", body)),
      {
        success: category ? "Rubrique enregistrée." : "Rubrique créée.",
        error: null,
        onError: (err) => setError(actionErrorMessage(err)),
        onSuccess: onClose,
      },
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={category ? "Modifier la rubrique" : "Nouvelle rubrique"}
      footer={
        <>
          <Btn variant="o" onClick={onClose}>Annuler</Btn>
          <Btn loading={action.isRunning("category")} onClick={submit}>Enregistrer</Btn>
        </>
      }
    >
      <Field label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      <Field
        label="Sous-titre"
        hint="Une ligne sous le titre, sur la tuile de /aide."
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        maxLength={120}
      />
      <fieldset>
        <legend className="mb-2 text-[13.5px] font-bold">Icône</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {HELP_ICON_KEYS.map((key) => {
            const Icon = HELP_ICONS[key];
            return (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-nk-sm border px-2 py-2.5 text-[13px] font-semibold",
                  icon === key ? "border-brand bg-brand-tint text-brand" : "border-line text-ink-2 hover:border-ink-3",
                )}
              >
                <input type="radio" name="help-icon" value={key} checked={icon === key} onChange={() => setIcon(key)} className="sr-only" />
                <Icon className="size-5" aria-hidden="true" />
                {HELP_ICON_LABELS[key]}
              </label>
            );
          })}
        </div>
      </fieldset>
      {error ? <p className="mt-3 text-[13px] font-semibold text-danger">{error}</p> : null}
    </Modal>
  );
}

function ArticleDialog({
  article,
  categoryId: initialCategory,
  categories,
  values,
  onClose,
  action,
}: {
  article: EditorArticle | null;
  categoryId: string;
  categories: EditorCategory[];
  values: HelpValues;
  onClose: () => void;
  action: Action;
}) {
  const [categoryId, setCategoryId] = React.useState(initialCategory);
  const [question, setQuestion] = React.useState(article?.question ?? "");
  const [answer, setAnswer] = React.useState(article?.answer ?? "");
  const [published, setPublished] = React.useState(article?.published ?? true);
  const [onHomepage, setOnHomepage] = React.useState(article?.onHomepage ?? false);
  const [error, setError] = React.useState<string | null>(null);
  const answerRef = React.useRef<HTMLTextAreaElement>(null);

  const problems = answerProblems(answer);
  const preview = renderAnswer(answer, values);

  // Le marqueur s'insère là où se trouve le curseur, pas en fin de texte.
  function insertMarker(key: HelpMarker) {
    const el = answerRef.current;
    const token = `{${key}}`;
    if (!el) return setAnswer((a) => a + token);
    const start = el.selectionStart ?? answer.length;
    const end = el.selectionEnd ?? answer.length;
    const next = answer.slice(0, start) + token + answer.slice(end);
    setAnswer(next);
    // Après le rendu qui pose la nouvelle valeur : le curseur revient juste
    // après le marqueur, et la frappe continue dans le champ.
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  }

  function submit() {
    if (!question.trim() || !answer.trim()) return setError("La question et sa réponse sont toutes deux nécessaires.");
    if (problems.length > 0) return setError(problems[0]);
    const body = { categoryId, question, answer, published, onHomepage };
    void action.run(
      "article",
      () => (article ? api.patch(`/api/admin/help/articles/${article.id}`, body) : api.post("/api/admin/help/articles", body)),
      {
        success: article ? "Question enregistrée." : "Question créée.",
        error: null,
        onError: (err) => setError(actionErrorMessage(err)),
        onSuccess: onClose,
      },
    );
  }

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(open) => !open && onClose()}
      title={article ? "Modifier la question" : "Nouvelle question"}
      footer={
        <>
          <Btn variant="o" onClick={onClose}>Annuler</Btn>
          <Btn loading={action.isRunning("article")} onClick={submit}>Enregistrer</Btn>
        </>
      }
    >
      <label htmlFor="aide-rubrique" className="mb-1.5 block text-[13.5px] font-bold">Rubrique</label>
      <select
        id="aide-rubrique"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="mb-[18px] w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-base md:text-[15px]"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.title}</option>
        ))}
      </select>

      <Field label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} />

      <label htmlFor="aide-reponse-texte" className="mb-1.5 block text-[13.5px] font-bold">Réponse</label>
      <textarea
        id="aide-reponse-texte"
        ref={answerRef}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={6}
        maxLength={4000}
        aria-describedby="aide-reponse-aide"
        className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-base leading-relaxed outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25 md:text-[15px]"
      />
      <p id="aide-reponse-aide" className="mt-1.5 text-[13px] text-ink-3">
        Lien vers une page du site : <code>[conditions d&apos;utilisation](/legal/conditions)</code>. Les chiffres ne
        s&apos;écrivent pas à la main : insérez le marqueur, le site affiche la valeur en vigueur.
      </p>

      <div className="mt-3">
        <p className="mb-2 text-[13px] font-bold">Insérer une valeur</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(HELP_MARKERS) as HelpMarker[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => insertMarker(key)}
              title={HELP_MARKERS[key]}
              className="nk-tap cursor-pointer rounded-full border border-line bg-card px-2.5 py-1 text-[13px] text-ink-2 hover:border-brand hover:text-brand"
            >
              {HELP_MARKERS[key]} <span className="text-ink-3">· {values[key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-nk-sm border border-line-2 bg-paper px-4 py-3">
        <p className="mb-1 flex items-center gap-1.5 text-[13px] font-bold text-ink-3">
          <Eye className="size-3.5" aria-hidden="true" /> Aperçu, tel que le site l&apos;affichera
        </p>
        <p className="text-[14.5px] leading-[1.65] text-ink-2">
          {answer.trim() ? <HelpAnswer segments={preview} /> : <span className="text-ink-3">La réponse s&apos;affichera ici.</span>}
        </p>
        {problems.length > 0 ? (
          <ul className="mt-2 text-[13px] font-semibold text-danger">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}
      </div>

      <div className="mt-4">
        <CheckOption checked={published} onCheckedChange={setPublished} label="Publiée sur le site (décochée : masquée, conservée ici)" />
        <CheckOption checked={onHomepage} onCheckedChange={setOnHomepage} label="Reprise dans la FAQ de la page d'accueil" />
      </div>
      {error ? <p className="mt-3 text-[13px] font-semibold text-danger">{error}</p> : null}
    </Modal>
  );
}

function ConfirmDialog({
  title,
  description,
  disabled,
  running,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  running: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      size="sm"
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Btn variant="o" onClick={onClose}>Annuler</Btn>
          <Btn variant="danger" disabled={disabled} loading={running} onClick={onConfirm}>Supprimer</Btn>
        </>
      }
    />
  );
}
