import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListFreelancers, getListFreelancersQueryKey, useCreateFreelancer, useUpdateFreelancer, useDeleteFreelancer, useGetFreelancerHistory, useGetFreelancerEvaluation } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Star, Upload, History, CheckCircle2, Clock, Briefcase, BarChart3, Target, TrendingUp } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

type Freelancer = { code: string; name: string; phone?: string | null; spec?: string | null; position?: string | null; earned: number; balance: number; rating: number; };

const emptyForm = { name: "", phone: "", spec: "", position: "", earned: 0, balance: 0, rating: 5 };

function CardContentLite({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <CardContent className="px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">{icon}<span>{label}</span></div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </CardContent>
  );
}

function KanbanSquareLite() {
  return <span className="text-primary text-xs font-bold">#</span>;
}

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Freelancer | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [historyCode, setHistoryCode] = useState<string | null>(null);
  const [evalCode, setEvalCode] = useState<string | null>(null);
  const evalQ = useGetFreelancerEvaluation(evalCode ?? "", { query: { enabled: !!evalCode } } as Parameters<typeof useGetFreelancerEvaluation>[1]);
  const evaluation = evalQ.data as undefined | {
    freelancerCode: string; freelancerName: string;
    projectsCount: number; completedProjects: number;
    totalEarned: number; avgRating: number; ratedProjects: number;
    onTimePct: number; tasksCount: number; completedTasks: number;
  };
  const historyQ = useGetFreelancerHistory(historyCode ?? "", { query: { enabled: !!historyCode } } as Parameters<typeof useGetFreelancerHistory>[1]);
  const loadingHistory = historyQ.isLoading;
  const history = historyQ.data as undefined | {
    freelancer: { name: string };
    tasks: Array<{ id: number; title: string; description?: string | null; status: string; priority?: string | null; projectName?: string | null; dueDate?: string | null; createdAt: string }>;
    projects: Array<{ id: number; projectName: string; clientName: string; status: string; commission: number; startDate: string; deadline: string; notes: string }>;
    totals: { taskCount: number; completedTasks: number; projectCount: number; totalCommission: number };
  };

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
        <h1 className="text-2xl font-bold tracking-tight">{t('freelancers.title')}</h1>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImport} data-testid="input-import-file" />
          <Button variant="outline" onClick={onPickImport} data-testid="button-import-freelancers" disabled={importing}>
            <Upload className="h-4 w-4 mr-2" /> {importing ? "Importing..." : "Import Excel"}
          </Button>
          <Button onClick={openCreate} data-testid="button-add-freelancer" className="bg-primary text-black hover:bg-primary/90">
            <Plus className="h-4 w-4 me-2" /> {t('freelancers.new')}
          </Button>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-search-freelancers" placeholder={t('freelancers.searchPlaceholder')} className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {["Code", "Name", "Phone", "Specialization", "Position", "Earned", "Balance", "Rating", "Score", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">{t('freelancers.noFreelancers')}</td></tr>
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
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <BarChart3 className="h-3.5 w-3.5" /> {Number(fr.rating).toFixed(1)}/5
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 items-center">
                      <Button size="sm" variant="outline" data-testid={`button-evaluate-${fr.code}`} onClick={() => setEvalCode(fr.code)} className="border-green-500/40 text-green-400 hover:bg-green-500/10 h-8 px-2">
                        <BarChart3 className="h-3.5 w-3.5 mr-1" /> Evaluate
                      </Button>
                      <Button size="sm" variant="outline" data-testid={`button-history-${fr.code}`} onClick={() => setHistoryCode(fr.code)} className="border-primary/40 text-primary hover:bg-primary/10 h-8 px-2">
                        <History className="h-3.5 w-3.5 mr-1" /> History
                      </Button>
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
          <DialogHeader><DialogTitle>{editing ? t('freelancers.edit') : t('freelancers.new')}</DialogTitle></DialogHeader>
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
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
            <Button data-testid="button-save-freelancer" onClick={handleSave} disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={evalCode !== null} onOpenChange={(v) => !v && setEvalCode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-green-400" />
              {evaluation?.freelancerName ? `${evaluation.freelancerName} — Evaluation` : "Freelancer Evaluation"}
            </DialogTitle>
          </DialogHeader>
          {evalQ.isLoading ? (
            <div className="py-10 text-center text-muted-foreground">{t('common.loading')}</div>
          ) : evaluation ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-card/50">
                  <CardContentLite icon={<Briefcase className="h-4 w-4 text-primary" />} label="Projects" value={evaluation.projectsCount} />
                </Card>
                <Card className="bg-card/50">
                  <CardContentLite icon={<CheckCircle2 className="h-4 w-4 text-green-400" />} label="Completed" value={evaluation.completedProjects} />
                </Card>
                <Card className="bg-card/50">
                  <CardContentLite icon={<span className="text-primary text-xs font-bold">EGP</span>} label="Total Earned" value={<PrivacyWrapper value={evaluation.totalEarned} />} />
                </Card>
                <Card className="bg-card/50">
                  <CardContentLite icon={<KanbanSquareLite />} label="Tasks" value={`${evaluation.completedTasks}/${evaluation.tasksCount}`} />
                </Card>
              </div>

              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-primary mb-1 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Performance
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-400" /> Average Rating
                  </span>
                  <div className="flex items-center gap-2">
                    <Stars rating={evaluation.avgRating} />
                    <span className="font-semibold text-sm">
                      {evaluation.avgRating > 0 ? `${evaluation.avgRating.toFixed(1)}/5` : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">({evaluation.ratedProjects} rated)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Target className="h-4 w-4 text-green-400" /> On-Time Delivery
                  </span>
                  <span className="font-semibold text-sm">
                    {evaluation.completedProjects > 0 ? `${evaluation.onTimePct}%` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" /> Completion Rate
                  </span>
                  <span className="font-semibold text-sm">
                    {evaluation.projectsCount > 0
                      ? `${Math.round((evaluation.completedProjects / evaluation.projectsCount) * 100)}%`
                      : "—"}
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground px-1">
                Auto-computed from per-project ratings, deadlines, and earnings. Per-project ratings are set inside each project's edit form.
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-muted-foreground">No data</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEvalCode(null)}>{t('common.close', { defaultValue: 'Close' })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyCode !== null} onOpenChange={(v) => !v && setHistoryCode(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {history?.freelancer?.name ? `${history.freelancer.name} — History` : "Freelancer History"}
            </DialogTitle>
          </DialogHeader>
          {loadingHistory ? (
            <div className="py-10 text-center text-muted-foreground">{t('common.loading')}</div>
          ) : history ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-card/50"><CardContentLite icon={<Briefcase className="h-4 w-4 text-primary" />} label="Projects" value={history.totals.projectCount} /></Card>
                <Card className="bg-card/50"><CardContentLite icon={<KanbanSquareLite />} label="Tasks" value={history.totals.taskCount} /></Card>
                <Card className="bg-card/50"><CardContentLite icon={<CheckCircle2 className="h-4 w-4 text-green-400" />} label="Completed" value={history.totals.completedTasks} /></Card>
                <Card className="bg-card/50"><CardContentLite icon={<span className="text-primary text-xs font-bold">EGP</span>} label="Commission" value={<PrivacyWrapper value={history.totals.totalCommission} />} /></Card>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><Briefcase className="h-4 w-4 text-primary" /> Projects</div>
                {history.projects.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-3 px-2">No projects yet</div>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-card/80 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Project</th>
                          <th className="px-3 py-2 text-left">Client</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">Start</th>
                          <th className="px-3 py-2 text-left">Deadline</th>
                          <th className="px-3 py-2 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.projects.map((p) => (
                          <tr key={p.id} className="border-t border-border/40">
                            <td className="px-3 py-2 font-medium">{p.projectName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{p.clientName || "—"}</td>
                            <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{p.status}</Badge></td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{p.startDate || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{p.deadline || "—"}</td>
                            <td className="px-3 py-2 text-right text-green-400"><PrivacyWrapper value={p.commission} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><Clock className="h-4 w-4 text-primary" /> Tasks</div>
                {history.tasks.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-3 px-2">No tasks assigned</div>
                ) : (
                  <div className="space-y-2">
                    {history.tasks.map((tk) => (
                      <div key={tk.id} className="rounded-md border border-border/60 p-3 bg-card/40">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{tk.title}</span>
                              <Badge variant="outline" className={
                                tk.status === "Done" ? "text-green-400 border-green-500/40 text-[10px]" :
                                tk.status === "In Progress" ? "text-blue-400 border-blue-500/40 text-[10px]" :
                                "text-muted-foreground text-[10px]"
                              }>{tk.status}</Badge>
                              {tk.priority && <Badge variant="outline" className="text-[10px]">{tk.priority}</Badge>}
                              {tk.projectName && <Badge variant="outline" className="text-[10px] text-primary border-primary/30">{tk.projectName}</Badge>}
                            </div>
                            {tk.description && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{tk.description}</div>}
                          </div>
                          <div className="text-xs text-muted-foreground text-right shrink-0">
                            <div>Created: {new Date(tk.createdAt).toLocaleDateString()}</div>
                            {tk.dueDate && <div>Due: {tk.dueDate}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-muted-foreground">No data</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryCode(null)}>{t('common.close', { defaultValue: 'Close' })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteCode !== null} onOpenChange={(v) => !v && setDeleteCode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('freelancers.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{t('common.deleteConfirmDesc')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
