import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTemplates, getListTemplatesQueryKey, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type Template = { id: number; category: string; name: string; cost: number; expenses: number; multiplier: number; broker: number; students: number; };

const emptyForm = { category: "Software", name: "", cost: 0, expenses: 0, multiplier: 1, broker: 0, students: 0 };

export default function Templates() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("Software");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: templates = [], isLoading } = useListTemplates({ category: tab });
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const del = useDeleteTemplate();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTemplatesQueryKey() });

  const openCreate = () => { setForm({ ...emptyForm, category: tab }); setEditing(null); setShowForm(true); };
  const openEdit = (t: Template) => { setEditing(t); setForm({ category: t.category, name: t.name, cost: t.cost, expenses: t.expenses, multiplier: t.multiplier, broker: t.broker, students: t.students }); setShowForm(true); };

  const handleSave = () => {
    const data = { ...form, cost: Number(form.cost), expenses: Number(form.expenses), multiplier: Number(form.multiplier), broker: Number(form.broker), students: Number(form.students) };
    if (editing) {
      update.mutate({ id: editing.id, data } as Parameters<typeof update.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Template updated" }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    } else {
      create.mutate({ data } as Parameters<typeof create.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Template added" }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (deleteId === null) return;
    del.mutate({ id: deleteId } as Parameters<typeof del.mutate>[0], {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Deleted" }); },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const fs = (k: string) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const cols = tab === "Software"
    ? ["Name", "Cost (EGP)", "Expenses (EGP)", "Multiplier", "Actions"]
    : ["Name", "Cost/Trainee", "Broker Fee", "Students", "Actions"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('templates.title')}</h1>
        <Button onClick={openCreate} data-testid="button-add-template" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 me-2" /> {t('templates.new')}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="Software" data-testid="tab-software">Software</TabsTrigger>
          <TabsTrigger value="Training" data-testid="tab-training">Training</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr className="border-b border-border">
                    {cols.map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(templates as Template[]).length === 0 ? (
                    <tr><td colSpan={cols.length} className="px-4 py-8 text-center text-muted-foreground">No templates yet</td></tr>
                  ) : (templates as Template[]).map((t) => (
                    <tr key={t.id} data-testid={`row-template-${t.id}`} className="border-b border-border hover:bg-card/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3"><PrivacyWrapper value={tab === "Software" ? t.cost : t.cost} /></td>
                      {tab === "Software" ? (
                        <>
                          <td className="px-4 py-3 text-red-400"><PrivacyWrapper value={t.expenses} /></td>
                          <td className="px-4 py-3">{t.multiplier}x</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-orange-400"><PrivacyWrapper value={t.broker} /></td>
                          <td className="px-4 py-3">{t.students}</td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" data-testid={`button-edit-template-${t.id}`} onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" data-testid={`button-delete-template-${t.id}`} onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Template" : "Add Template"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={fs("category")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Software">Software</SelectItem><SelectItem value="Training">Training</SelectItem></SelectContent></Select>
            </div>
            <div className="col-span-2 space-y-1"><Label>Template Name</Label><Input data-testid="input-template-name" value={form.name} onChange={f("name")} /></div>
            <div className="space-y-1"><Label>Cost (EGP)</Label><Input type="number" value={form.cost} onChange={f("cost")} /></div>
            <div className="space-y-1"><Label>Expenses (EGP)</Label><Input type="number" value={form.expenses} onChange={f("expenses")} /></div>
            <div className="space-y-1"><Label>Multiplier</Label><Input type="number" step={0.1} value={form.multiplier} onChange={f("multiplier")} /></div>
            <div className="space-y-1"><Label>Broker Fee (EGP)</Label><Input type="number" value={form.broker} onChange={f("broker")} /></div>
            <div className="space-y-1"><Label>Students</Label><Input type="number" value={form.students} onChange={f("students")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
            <Button data-testid="button-save-template" onClick={handleSave} disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('templates.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{t('common.deleteConfirmDesc')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
