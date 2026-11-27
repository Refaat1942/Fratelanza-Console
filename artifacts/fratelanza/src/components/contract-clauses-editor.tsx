import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contractClauses, type ClauseEdits } from "@/lib/contract-document";
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, RotateCcw, ListChecks } from "lucide-react";

/**
 * Every clause of the contract: hide it, rename it, or rewrite its text.
 * `defaultHtml` is the contract built without any clause edits.
 */
export function ContractClausesEditor({ defaultHtml, edits, onChange }: { defaultHtml: string; edits?: ClauseEdits; onChange: (v: ClauseEdits | undefined) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const clauses = useMemo(() => contractClauses(defaultHtml), [defaultHtml]);
  const set = (key: string, patch: Partial<NonNullable<ClauseEdits[string]>>) => {
    const next = { ...edits, [key]: { ...edits?.[key], ...patch } };
    onChange(next);
  };
  const changed = Object.values(edits ?? {}).filter((e) => e.hidden || e.title?.trim() || e.text !== undefined).length;

  return (
    <div className="rounded-lg border border-border p-3 space-y-3" data-testid="contract-clauses">
      <button type="button" className="w-full flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-primary" onClick={() => setOpen((v) => !v)} data-testid="toggle-contract-clauses">
        <span className="flex items-center gap-2"><ListChecks className="h-4 w-4" />{t("contractClauses.title")}{changed > 0 && <span className="normal-case text-amber-500">({t("contractClauses.changed", { count: changed })})</span>}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <>
        <p className="text-[11px] text-muted-foreground">{t("contractClauses.hint")}</p>
        {changed > 0 && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange(undefined)} data-testid="button-reset-clauses"><RotateCcw className="h-3.5 w-3.5 me-1" />{t("contractClauses.resetAll")}</Button>}
        <div className="space-y-2">
          {clauses.map((c, i) => {
            const e = edits?.[c.key] ?? {};
            const shown = !e.hidden;
            const editing = e.text !== undefined;
            return (
              <div key={c.key} className={`rounded border border-border p-2 space-y-2 ${shown ? "" : "opacity-50"}`} data-testid={`clause-${i}`}>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => set(c.key, { hidden: shown })} className={shown ? "text-primary" : "text-muted-foreground"}
                    title={shown ? t("contractClauses.hide") : t("contractClauses.show")} data-testid={`toggle-clause-${i}`}>
                    {shown ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <Input className="flex-1 h-8 text-sm" value={e.title ?? ""} placeholder={c.title} disabled={!shown} onChange={(ev) => set(c.key, { title: ev.target.value })} data-testid={`input-clause-title-${i}`} />
                  {shown && (
                    <Button size="sm" variant={editing ? "secondary" : "outline"} className="h-8 text-xs shrink-0" onClick={() => set(c.key, { text: editing ? undefined : c.text })} data-testid={`edit-clause-${i}`}>
                      {editing ? <><RotateCcw className="h-3.5 w-3.5 me-1" />{t("contractClauses.original")}</> : <><Pencil className="h-3.5 w-3.5 me-1" />{t("contractClauses.edit")}</>}
                    </Button>
                  )}
                </div>
                {shown && editing && (
                  <Textarea rows={Math.min(14, Math.max(4, Math.ceil((e.text ?? "").length / 70)))} className="text-sm leading-relaxed" dir="rtl"
                    value={e.text} onChange={(ev) => set(c.key, { text: ev.target.value })} data-testid={`input-clause-text-${i}`} />
                )}
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}
