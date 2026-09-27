import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListExpenses, getListExpensesQueryKey, useCreateExpense, useUpdateExpense, useDeleteExpense,
  useGetExpenseSummary, getGetExpenseSummaryQueryKey, useListFreelancers,
} from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { PeriodPicker, usePeriod } from "@/components/period-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Info, Plus, Trash2, TrendingDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "@/lib/expense-categories";

type Expense = { id: number; description: string; amount: number; date?: string | null; category?: string };

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ description: "", amount: 0, date: today(), category: "other" });

export default function Expenses() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [category, setCategory] = useState("all");
  const { period, setPeriod, params: periodParams } = usePeriod();

  const params = { ...periodParams, category: category === "all" ? undefined : category };
  const { data: expenses = [], isLoading } = useListExpenses(params, { query: { queryKey: getListExpensesQueryKey(params) } });
  const { data: summary } = useGetExpenseSummary(periodParams, { query: { queryKey: getGetExpenseSummaryQueryKey(periodParams) } });
  const { data: freelancers = [] } = useListFreelancers();
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const del = useDeleteExpense();

  // An expense whose description names a freelancer is probably a freelancer payment,
  // which belongs on the project (Projects → Payments), not in company expenses.
  const freelancerNames = freelancers.map((f) => f.name.trim().toLowerCase()).filter((n) => n.length > 2);
  const looksLikeFreelancer = (text: string) => {
    const d = text.trim().toLowerCase();
    return d.length > 0 && freelancerNames.some((n) => d.includes(n));
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetExpenseSummaryQueryKey() });
  };

  const handleSave = () => {
    create.mutate({ data: { ...form, amount: Number(form.amount) } }, {
      onSuccess: () => { invalidate(); setShowForm(false); setForm(emptyForm()); toast({ title: t("expenses.added") }); },
      onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    });
  };

  const changeCategory = (id: number, value: string) => {
    update.mutate({ id, data: { category: value } }, {
      onSuccess: () => invalidate(),
      onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (deleteId === null) return;
    del.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: t("common.deleted") }); },
      onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    });
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const byCategory = summary?.byCategory ?? [];
  const list = expenses as Expense[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("expenses.title")}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodPicker period={period} onChange={setPeriod} />
          <Button onClick={() => setShowForm(true)} data-testid="button-add-expense" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 me-2" /> {t("expenses.new")}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <span>{t("expenses.separateNote")}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-400" />{t("expenses.total")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400"><PrivacyWrapper value={summary?.totalExpenses ?? 0} /></div>
            <div className="text-xs text-muted-foreground">{t("expenses.recordCount", { count: summary?.count ?? 0 })}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("expenses.byCategory")}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {byCategory.length === 0 ? <span className="text-sm text-muted-foreground">—</span> : byCategory.map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => setCategory(category === c.category ? "all" : c.category)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${category === c.category ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-card"}`}
                data-testid={`chip-category-${c.category}`}
              >
                {expenseCategoryLabel(c.category, lang)} · <PrivacyWrapper value={c.total} />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm">{t("expenses.category")}</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-56" data-testid="select-filter-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("expenses.allCategories")}</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{lang.startsWith("ar") ? c.labelAr : c.labelEn}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {[t("expenses.date"), t("expenses.category"), t("expenses.description"), t("expenses.amount"), ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t("expenses.none")}</td></tr>
              ) : list.map((e) => (
                <tr key={e.id} data-testid={`row-expense-${e.id}`} className="border-b border-border hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.date ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Select value={e.category ?? "other"} onValueChange={(v) => changeCategory(e.id, v)}>
                      <SelectTrigger className="h-8 w-52" data-testid={`select-category-${e.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{lang.startsWith("ar") ? c.labelAr : c.labelEn}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    {e.description}
                    {looksLikeFreelancer(e.description) && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-yellow-500"><AlertTriangle className="h-3 w-3" />{t("expenses.freelancerWarning")}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-red-400 font-medium whitespace-nowrap"><PrivacyWrapper value={e.amount} /></td>
                  <td className="px-4 py-3">
                    <Button size="icon" variant="ghost" data-testid={`button-delete-expense-${e.id}`} onClick={() => setDeleteId(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("expenses.new")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>{t("expenses.category")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                <SelectTrigger data-testid="select-expense-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{lang.startsWith("ar") ? c.labelAr : c.labelEn}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("expenses.description")}</Label>
              <Input data-testid="input-expense-desc" value={form.description} onChange={f("description")} placeholder={t("expenses.descriptionPlaceholder")} />
              {looksLikeFreelancer(form.description) && (
                <div className="flex items-center gap-1 text-xs text-yellow-500"><AlertTriangle className="h-3 w-3" />{t("expenses.freelancerWarning")}</div>
              )}
            </div>
            <div className="space-y-1"><Label>{t("expenses.amount")}</Label><Input data-testid="input-expense-amount" type="number" value={form.amount} onChange={f("amount")} /></div>
            <div className="space-y-1"><Label>{t("expenses.date")}</Label><Input type="date" value={form.date} onChange={f("date")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-save-expense" onClick={handleSave} disabled={create.isPending || !form.description || !Number(form.amount)}>{create.isPending ? t("common.saving") : t("expenses.new")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("expenses.deleteTitle")}</AlertDialogTitle><AlertDialogDescription>{t("common.deleteConfirmDesc")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
