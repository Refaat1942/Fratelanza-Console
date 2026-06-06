import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListQuotes, getListQuotesQueryKey, useCreateQuote, useUpdateQuote, useDeleteQuote, useListClients } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, X, Printer } from "lucide-react";
import { printQuote } from "@/lib/quote-pdf";
import { displayProjectName, packProjectName, resolveQuoteLineItems, type QuoteLineItem } from "@/lib/quote-line-items";
import { useBranding } from "@/lib/branding-context";
import { useTranslation } from "react-i18next";

type Quote = {
  id: number;
  clientName: string;
  projectName?: string | null;
  lineItems?: QuoteLineItem[] | null;
  price: number;
  language?: string | null;
  date?: string | null;
  paymentTerms?: string | null;
  milestones?: string | null;
  notes?: string | null;
};

const emptyForm = {
  clientName: "",
  language: "English",
  date: new Date().toISOString().slice(0, 10),
  paymentTerms: "",
  milestones: "",
  notes: "",
};

export default function Quotes() {
  const { t } = useTranslation();
  const branding = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [lineDesc, setLineDesc] = useState("");
  const [linePrice, setLinePrice] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: quotes = [], isLoading } = useListQuotes({ client: search || undefined });
  const { data: clients = [] } = useListClients();
  const create = useCreateQuote();
  const update = useUpdateQuote();
  const del = useDeleteQuote();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
  const totalPrice = lineItems.reduce((s, i) => s + i.price, 0);

  const addLine = () => {
    if (!lineDesc || !linePrice) return;
    setLineItems((prev) => [...prev, { desc: lineDesc, price: Number(linePrice) }]);
    setLineDesc("");
    setLinePrice("");
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setLineItems([]);
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (q: Quote) => {
    setEditing(q);
    setForm({
      clientName: q.clientName,
      language: q.language ?? "English",
      date: q.date ?? emptyForm.date,
      paymentTerms: q.paymentTerms ?? "",
      milestones: q.milestones ?? "",
      notes: q.notes ?? "",
    });
    setLineItems(resolveQuoteLineItems(q));
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.clientName.trim()) {
      toast({ title: t("quotes.clientRequired"), variant: "destructive" });
      return;
    }
    if (lineItems.length === 0) {
      toast({ title: t("quotes.itemsRequired"), variant: "destructive" });
      return;
    }

    const data = {
      ...form,
      projectName: packProjectName(lineItems),
      lineItems,
      price: totalPrice,
    };

    if (editing) {
      update.mutate({ id: editing.id, data } as Parameters<typeof update.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: t("quotes.updated") }); },
        onError: () => toast({ title: t("common.error"), variant: "destructive" }),
      });
    } else {
      create.mutate({ data } as Parameters<typeof create.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: t("quotes.created") }); },
        onError: () => toast({ title: t("common.error"), variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (deleteId === null) return;
    del.mutate({ id: deleteId } as Parameters<typeof del.mutate>[0], {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: t("quotes.deleted") }); },
      onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    });
  };

  const handlePrint = (q: Quote) => {
    const items = resolveQuoteLineItems(q);
    printQuote({ ...q, lineItems: items }, { logoDataUrl: branding.logoDataUrl, brandName: branding.brandName });
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const fs = (k: string) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const tableHeaders = [
    t("quotes.clientName"),
    t("quotes.projectName"),
    t("quotes.price"),
    t("quotes.language"),
    t("quotes.date"),
    t("common.actions"),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("quotes.title")}</h1>
        <Button onClick={openCreate} data-testid="button-create-quote" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 me-2" /> {t("quotes.new")}
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("quotes.searchPlaceholder")}
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {tableHeaders.map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(quotes as Quote[]).length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{t("quotes.noQuotes")}</td></tr>
              ) : (quotes as Quote[]).map((q) => (
                <tr key={q.id} data-testid={`row-quote-${q.id}`} className="border-b border-border hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{q.clientName}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{displayProjectName(q.projectName)}</td>
                  <td className="px-4 py-3 font-semibold text-primary"><PrivacyWrapper value={q.price} /></td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {q.language === "Arabic" ? t("quotes.languageArabic") : t("quotes.languageEnglish")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title={t("quotes.printPdf")} data-testid={`button-print-quote-${q.id}`} onClick={() => handlePrint(q)}>
                        <Printer className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" data-testid={`button-edit-quote-${q.id}`} onClick={() => openEdit(q)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" data-testid={`button-delete-quote-${q.id}`} onClick={() => setDeleteId(q.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("quotes.edit") : t("quotes.new")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("quotes.clientName")}</Label>
                <Select value={form.clientName} onValueChange={fs("clientName")}>
                  <SelectTrigger data-testid="input-quote-client">
                    <SelectValue placeholder={t("quotes.selectClient")} />
                  </SelectTrigger>
                  <SelectContent>
                    {form.clientName && !clients.some((c) => c.name === form.clientName) && (
                      <SelectItem value={form.clientName}>{form.clientName}</SelectItem>
                    )}
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("quotes.language")}</Label>
                <Select value={form.language} onValueChange={fs("language")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="English">{t("quotes.languageEnglish")}</SelectItem>
                    <SelectItem value="Arabic">{t("quotes.languageArabic")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("quotes.date")}</Label>
                <Input type="date" value={form.date} onChange={f("date")} />
              </div>
            </div>

            <Separator />
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t("quotes.lineItems")}</Label>
              <p className="text-xs text-muted-foreground">{t("quotes.lineItemsHint")}</p>
              <div className="flex gap-2">
                <Input
                  placeholder={t("quotes.itemDescription")}
                  value={lineDesc}
                  onChange={(e) => setLineDesc(e.target.value)}
                  className="flex-1"
                  data-testid="input-line-desc"
                />
                <Input
                  placeholder={t("quotes.itemPrice")}
                  type="number"
                  value={linePrice}
                  onChange={(e) => setLinePrice(e.target.value)}
                  className="w-32"
                  data-testid="input-line-price"
                />
                <Button variant="outline" onClick={addLine} data-testid="button-add-line">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {lineItems.length > 0 && (
                <div className="rounded border border-border">
                  {lineItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-border last:border-0">
                      <span className="text-sm">{item.desc}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-primary"><PrivacyWrapper value={item.price} /></span>
                        <button type="button" onClick={() => setLineItems((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between px-3 py-2 bg-card font-semibold text-sm">
                    <span>{t("quotes.total")}</span>
                    <span className="text-primary"><PrivacyWrapper value={totalPrice} /></span>
                  </div>
                </div>
              )}
            </div>

            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("quotes.paymentTerms")}</Label>
                <Textarea value={form.paymentTerms} onChange={f("paymentTerms")} rows={3} placeholder={t("quotes.paymentTermsPlaceholder")} />
              </div>
              <div className="space-y-1">
                <Label>{t("quotes.milestones")}</Label>
                <Textarea value={form.milestones} onChange={f("milestones")} rows={3} placeholder={t("quotes.milestonesPlaceholder")} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("quotes.notes")}</Label>
                <Textarea value={form.notes} onChange={f("notes")} rows={2} placeholder={t("quotes.notesPlaceholder")} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-save-quote" onClick={handleSave} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
