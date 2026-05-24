import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListFreelancers, getListFreelancersQueryKey, useCreateFreelancer, useUpdateFreelancer, useDeleteFreelancer } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Star, Upload } from "lucide-react";
import { useRef } from "react";

type Freelancer = { code: string; name: string; phone?: string | null; spec?: string | null; position?: string | null; earned: number; balance: number; rating: number; };

const emptyForm = { name: "", phone: "", spec: "", position: "", earned: 0, balance: 0, rating: 5 };

const SPECIALIZATIONS = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Mobile Developer (iOS)",
  "Mobile Developer (Android)",
  "Mobile Developer (React Native / Flutter)",
  "UI/UX Designer",
  "Graphic Designer",
  "DevOps Engineer",
  "Cloud Engineer (AWS / Azure / GCP)",
  "Data Engineer",
  "Data Scientist",
  "Machine Learning Engineer",
  "AI / LLM Engineer",
  "QA / Test Engineer",
  "Security Engineer",
  "Database Administrator",
  "WordPress Developer",
  "Shopify / E-commerce Developer",
  "ERP Consultant (SAP / Odoo)",
  "CRM Consultant (Salesforce / HubSpot)",
  "Business Analyst",
  "Project Manager",
  "Technical Writer",
  "Trainer / Instructor",
  "Other",
];

export default function Freelancers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Freelancer | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteCode, setDeleteCode] = useState<string | null>(null);

  const { data: freelancers = [], isLoading } = useListFreelancers();
  const create = useCreateFreelancer();
  const update = useUpdateFreelancer();
  const del = useDeleteFreelancer();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListFreelancersQueryKey() });

  const filtered = (freelancers as Freelancer[]).filter((f) =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || (f.spec ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setForm({ ...emptyForm }); setEditing(null); setShowForm(true); };
  const openEdit = (fr: Freelancer) => { setEditing(fr); setForm({ name: fr.name, phone: fr.phone ?? "", spec: fr.spec ?? "", position: fr.position ?? "", earned: fr.earned, balance: fr.balance, rating: fr.rating }); setShowForm(true); };

  const handleSave = () => {
    const data = { ...form, earned: Number(form.earned), balance: Number(form.balance), rating: Number(form.rating) };
    if (editing) {
      update.mutate({ code: editing.code, data } as Parameters<typeof update.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Updated" }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    } else {
      create.mutate({ data } as Parameters<typeof create.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Freelancer added" }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteCode) return;
    del.mutate({ code: deleteCode } as Parameters<typeof del.mutate>[0], {
      onSuccess: () => { invalidate(); setDeleteCode(null); toast({ title: "Deleted" }); },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const onPickImport = () => fileRef.current?.click();
  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
    try {
      const r = await fetch(`${apiBase}/freelancers/import`, { method: "POST", credentials: "include", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Import failed");
      invalidate();
      toast({ title: "Import complete", description: `${data.created} added, ${data.updated} updated, ${data.skipped} skipped${data.errors?.length ? `, ${data.errors.length} errors` : ""}` });
    } catch (err) {
      toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const Stars = ({ rating }: { rating: number }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`h-3 w-3 ${s <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Freelancers</h1>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImport} data-testid="input-import-file" />
          <Button variant="outline" onClick={onPickImport} data-testid="button-import-freelancers" disabled={importing}>
            <Upload className="h-4 w-4 mr-2" /> {importing ? "Importing..." : "Import Excel"}
          </Button>
          <Button onClick={openCreate} data-testid="button-add-freelancer" className="bg-primary text-black hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" /> Add Freelancer
          </Button>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-search-freelancers" placeholder="Search name or specialization..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {["Code", "Name", "Phone", "Specialization", "Position", "Earned", "Balance", "Rating", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No freelancers found</td></tr>
              ) : filtered.map((fr) => (
                <tr key={fr.code} data-testid={`row-freelancer-${fr.code}`} className="border-b border-border hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{fr.code}</td>
                  <td className="px-4 py-3 font-medium">{fr.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fr.phone ?? "—"}</td>
                  <td className="px-4 py-3">{fr.spec ? <Badge variant="outline" className="text-primary border-primary/30">{fr.spec}</Badge> : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fr.position ?? "—"}</td>
                  <td className="px-4 py-3 text-green-400"><PrivacyWrapper value={fr.earned} /></td>
                  <td className="px-4 py-3 text-yellow-400"><PrivacyWrapper value={fr.balance} /></td>
                  <td className="px-4 py-3"><Stars rating={fr.rating} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" data-testid={`button-edit-${fr.code}`} onClick={() => openEdit(fr)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" data-testid={`button-delete-${fr.code}`} onClick={() => setDeleteCode(fr.code)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Freelancer" : "Add Freelancer"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-1"><Label>Full Name</Label><Input data-testid="input-freelancer-name" value={form.name} onChange={f("name")} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={f("phone")} /></div>
            <div className="space-y-1">
              <Label>Specialization</Label>
              <Select value={form.spec || undefined} onValueChange={(v) => setForm((prev) => ({ ...prev, spec: v }))}>
                <SelectTrigger data-testid="select-spec"><SelectValue placeholder="Select specialization" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {SPECIALIZATIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Position</Label><Input value={form.position} onChange={f("position")} /></div>
            <div className="space-y-1"><Label>Rating (1-5)</Label><Input type="number" min={1} max={5} step={0.1} value={form.rating} onChange={f("rating")} /></div>
            <div className="space-y-1"><Label>Total Earned (EGP)</Label><Input type="number" value={form.earned} onChange={f("earned")} /></div>
            <div className="space-y-1"><Label>Balance (EGP)</Label><Input type="number" value={form.balance} onChange={f("balance")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button data-testid="button-save-freelancer" onClick={handleSave} disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteCode !== null} onOpenChange={(v) => !v && setDeleteCode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Freelancer?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
