import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListExpenses, getListExpensesQueryKey, useCreateExpense, useDeleteExpense, useGetExpenseSummary, getGetExpenseSummaryQueryKey } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, TrendingDown } from "lucide-react";
import { useTranslation } from "react-i18next";

type Expense = { id: number; description: string; amount: number; date?: string | null; };

export default function Expenses() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: "", amount: 0, date: new Date().toISOString().slice(0, 10) });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const params = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };

  const { data: expenses = [], isLoading } = useListExpenses(params);
  const { data: summary } = useGetExpenseSummary(params, { query: { queryKey: getGetExpenseSummaryQueryKey(params) } });
  const create = useCreateExpense();
  const del = useDeleteExpense();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetExpenseSummaryQueryKey() });
  };

  const handleSave = () => {
    create.mutate({ data: { ...form, amount: Number(form.amount) } } as Parameters<typeof create.mutate>[0], {
      onSuccess: () => { invalidate(); setShowForm(false); setForm({ description: "", amount: 0, date: new Date().toISOString().slice(0, 10) }); toast({ title: "Expense added" }); },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (deleteId === null) return;
    del.mutate({ id: deleteId } as Parameters<typeof del.mutate>[0], {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Deleted" }); },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('expenses.title')}</h1>
        <Button onClick={() => setShowForm(true)} data-testid="button-add-expense" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 me-2" /> {t('expenses.new')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-400" />Total Expenses</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-400"><PrivacyWrapper value={summary?.totalExpenses ?? 0} /></div></CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Record Count</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary?.count ?? 0}</div></CardContent>
        </Card>
        <div className="flex flex-col gap-2 justify-center">
          <div className="flex gap-2">
            <div className="space-y-1 flex-1"><Label className="text-xs">From</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1 flex-1"><Label className="text-xs">To</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }}>Clear Filter</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {["Description", "Amount", "Date", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(expenses as Expense[]).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No expenses recorded</td></tr>
              ) : (expenses as Expense[]).map((e) => (
                <tr key={e.id} data-testid={`row-expense-${e.id}`} className="border-b border-border hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3">{e.description}</td>
                  <td className="px-4 py-3 text-red-400 font-medium"><PrivacyWrapper value={e.amount} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{e.date ?? "—"}</td>
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
          <DialogHeader><DialogTitle>{t('expenses.new')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1"><Label>Description</Label><Input data-testid="input-expense-desc" value={form.description} onChange={f("description")} placeholder="What was this expense for?" /></div>
            <div className="space-y-1"><Label>Amount (EGP)</Label><Input data-testid="input-expense-amount" type="number" value={form.amount} onChange={f("amount")} /></div>
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={f("date")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
            <Button data-testid="button-save-expense" onClick={handleSave} disabled={create.isPending}>{create.isPending ? t('common.saving') : t('expenses.new')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('expenses.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{t('common.deleteConfirmDesc')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
