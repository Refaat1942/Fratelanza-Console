import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects, getListProjectsQueryKey,
  useCreateProject, useUpdateProject, useDeleteProject, useLogPayment,
  useListClients,
} from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { FreelancerPicker } from "@/components/freelancer-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, DollarSign, Search, X, Users, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

type Project = {
  id: number; type: string; projectName: string; clientName?: string | null;
  clientPrice: number; totalCost: number; netProfit: number;
  freelancerName?: string | null; freelancerCommission: number;
  startDate?: string | null; deadline?: string | null;
  status: string; paidAmount: number; remainingAmount: number;
  nextPaymentDate?: string | null; notes?: string | null; date: string;
};

type TeamMember = { freelancerName: string; commission: number };

const STATUS_COLORS: Record<string, string> = {
  Ongoing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Completed: "bg-green-500/20 text-green-400 border-green-500/30",
  Cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const empty = {
  type: "Software", projectName: "", clientName: "", clientPrice: 0,
  totalCost: 0, netProfit: 0, freelancerName: "", freelancerCommission: 0,
  startDate: "", deadline: "", status: "Ongoing", paidAmount: 0,
  remainingAmount: 0, nextPaymentDate: "", notes: "",
};

export default function Projects() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [paymentProject, setPaymentProject] = useState<Project | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");

  const { data: projects = [], isLoading } = useListProjects();
  const { data: clients = [] } = useListClients();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const logPayment = useLogPayment();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });

  const filtered = (projects as Project[]).filter((p) => {
    const matchType = typeFilter === "All" || p.type === typeFilter;
    const matchStatus = statusFilter === "All" || p.status === statusFilter;
    const matchSearch = !search || p.projectName.toLowerCase().includes(search.toLowerCase()) || (p.clientName ?? "").toLowerCase().includes(search.toLowerCase());
    return matchType && matchStatus && matchSearch;
  });

  const openCreate = () => { setForm({ ...empty }); setTeam([]); setEditing(null); setShowForm(true); };
  const openEdit = (p: Project) => {
    setEditing(p);
    setTeam([]);
    const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
    fetch(`${apiBase}/projects/${p.id}/team`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((t: Array<{ freelancerName: string; commission: number }>) => {
        const teamLoaded: TeamMember[] = t.map((m) => ({ freelancerName: m.freelancerName, commission: Number(m.commission) }));
        // Migrate legacy lead freelancer into the unified list if not already there
        if (p.freelancerName && !teamLoaded.some((m) => m.freelancerName === p.freelancerName)) {
          teamLoaded.unshift({ freelancerName: p.freelancerName, commission: Number(p.freelancerCommission ?? 0) });
        }
        setTeam(teamLoaded);
        const teamCommissionSum = teamLoaded.reduce((s, m) => s + m.commission, 0);
        const legacyLeadCommission = p.freelancerName ? 0 : Number(p.freelancerCommission ?? 0);
        const otherCosts = Math.max(0, Number(p.totalCost) - teamCommissionSum - legacyLeadCommission);
        setForm({ type: p.type, projectName: p.projectName, clientName: p.clientName ?? "", clientPrice: p.clientPrice, totalCost: otherCosts, netProfit: p.netProfit, freelancerName: "", freelancerCommission: 0, startDate: p.startDate ?? "", deadline: p.deadline ?? "", status: p.status, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount, nextPaymentDate: p.nextPaymentDate ?? "", notes: p.notes ?? "" });
      })
      .catch(() => {
        const teamLoaded: TeamMember[] = p.freelancerName
          ? [{ freelancerName: p.freelancerName, commission: Number(p.freelancerCommission ?? 0) }]
          : [];
        setTeam(teamLoaded);
        const otherCosts = Math.max(0, Number(p.totalCost) - teamLoaded.reduce((s, m) => s + m.commission, 0));
        setForm({ type: p.type, projectName: p.projectName, clientName: p.clientName ?? "", clientPrice: p.clientPrice, totalCost: otherCosts, netProfit: p.netProfit, freelancerName: "", freelancerCommission: 0, startDate: p.startDate ?? "", deadline: p.deadline ?? "", status: p.status, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount, nextPaymentDate: p.nextPaymentDate ?? "", notes: p.notes ?? "" });
      });
    setShowForm(true);
  };

  const addFreelancerRow = () => {
    setTeam((prev) => [...prev, { freelancerName: "", commission: 0 }]);
  };

  const removeFreelancerRow = (index: number) => {
    setTeam((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFreelancerRow = (index: number, patch: Partial<TeamMember>) => {
    setTeam((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const handleSave = () => {
    const cleanTeam = team.filter((m) => m.freelancerName.trim() !== "");
    const names = cleanTeam.map((m) => m.freelancerName);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      toast({ title: `Duplicate freelancer: ${dupes[0]}`, variant: "destructive" });
      return;
    }
    const totalCommission = cleanTeam.reduce((s, m) => s + Number(m.commission || 0), 0);
    const leadName = cleanTeam[0]?.freelancerName ?? "";
    const leadCommission = Number(cleanTeam[0]?.commission ?? 0);
    const data = {
      ...form,
      clientPrice: Number(form.clientPrice),
      totalCost: Number(form.totalCost) + totalCommission,
      netProfit: Number(form.clientPrice) - (Number(form.totalCost) + totalCommission),
      paidAmount: Number(form.paidAmount),
      remainingAmount: Number(form.clientPrice) - Number(form.paidAmount),
      freelancerName: leadName,
      freelancerCommission: leadCommission,
      team: cleanTeam.slice(1).map((m) => ({ freelancerName: m.freelancerName, commission: Number(m.commission || 0) })),
    };
    if (editing) {
      updateProject.mutate({ id: editing.id, data } as Parameters<typeof updateProject.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Project updated" }); },
        onError: () => toast({ title: "Error updating project", variant: "destructive" }),
      });
    } else {
      createProject.mutate({ data } as Parameters<typeof createProject.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Project created" }); },
        onError: () => toast({ title: "Error creating project", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (deleteId === null) return;
    deleteProject.mutate({ id: deleteId } as Parameters<typeof deleteProject.mutate>[0], {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Project deleted" }); },
      onError: () => toast({ title: "Error deleting", variant: "destructive" }),
    });
  };

  const handleLogPayment = () => {
    if (!paymentProject) return;
    logPayment.mutate({ id: paymentProject.id, data: { amount: Number(paymentAmount), nextPaymentDate: paymentDate || undefined } } as Parameters<typeof logPayment.mutate>[0], {
      onSuccess: () => { invalidate(); setPaymentProject(null); setPaymentAmount(""); setPaymentDate(""); toast({ title: "Payment logged" }); },
      onError: () => toast({ title: "Error logging payment", variant: "destructive" }),
    });
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const fs = (k: string) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const downPaymentPct = form.clientPrice > 0 ? Math.round((Number(form.paidAmount) / Number(form.clientPrice)) * 100) : 0;
  const remainingPreview = Number(form.clientPrice) - Number(form.paidAmount);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">{t('projects.title')}</h1>
        <Button onClick={openCreate} data-testid="button-create-project" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 me-2" /> {t('projects.new')}
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-search-projects" placeholder={t('projects.searchPlaceholder')} className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">{t('projects.allTypes')}</SelectItem>
            <SelectItem value="Software">{t('projects.typeSoftware')}</SelectItem>
            <SelectItem value="Training">{t('projects.typeTraining')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">{t('projects.allStatus')}</SelectItem>
            <SelectItem value="Ongoing">{t('projects.statusOngoing')}</SelectItem>
            <SelectItem value="Completed">{t('projects.statusCompleted')}</SelectItem>
            <SelectItem value="Cancelled">{t('projects.statusCancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('projects.loading')}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {[t('common.type'), t('projects.projectName'), t('projects.clientName'), t('projects.price'), t('dashboard.netProfit'), t('projects.paid'), t('projects.remaining'), t('common.status'), t('projects.actions')].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">{t('projects.noProjects')}</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id} data-testid={`row-project-${p.id}`} className="border-b border-border hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3"><Badge variant="outline" className={p.type === "Software" ? "text-blue-400 border-blue-500/30" : "text-yellow-400 border-yellow-500/30"}>{p.type}</Badge></td>
                  <td className="px-4 py-3 font-medium">{p.projectName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.clientName ?? "—"}</td>
                  <td className="px-4 py-3"><PrivacyWrapper value={p.clientPrice} /></td>
                  <td className="px-4 py-3 text-green-400"><PrivacyWrapper value={p.netProfit} /></td>
                  <td className="px-4 py-3 text-blue-400"><PrivacyWrapper value={p.paidAmount} /></td>
                  <td className="px-4 py-3 text-red-400"><PrivacyWrapper value={p.remainingAmount} /></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[p.status] ?? "bg-gray-500/20 text-gray-400"}`}>{p.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {p.remainingAmount > 0 && <Button size="icon" variant="ghost" title="Log Payment" data-testid={`button-pay-${p.id}`} onClick={() => { setPaymentProject(p); setPaymentAmount(""); setPaymentDate(""); }}><DollarSign className="h-4 w-4 text-green-400" /></Button>}
                      <Button size="icon" variant="ghost" data-testid={`button-edit-${p.id}`} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" data-testid={`button-delete-${p.id}`} onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('projects.edit') : t('projects.new')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="md:col-span-2 space-y-1">
              <Label>Project Name</Label>
              <Input data-testid="input-project-name" value={form.projectName} onChange={f("projectName")} />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={fs("type")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Software">Software</SelectItem><SelectItem value="Training">Training</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={fs("status")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Ongoing">Ongoing</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="Cancelled">Cancelled</SelectItem></SelectContent></Select>
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Client</Label>
              <Input data-testid="input-client-name" value={form.clientName} onChange={f("clientName")} />
            </div>

            {/* Freelancers list */}
            <div className="md:col-span-2 space-y-2 border border-border rounded-md p-3 bg-card/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-primary" /> Freelancers
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addFreelancerRow} data-testid="button-add-freelancer-row" className="h-8">
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Add Freelancer
                </Button>
              </div>
              {team.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2 px-1">No freelancers added. Click "Add Freelancer" to add one.</div>
              ) : (
                <div className="space-y-2">
                  {team.map((m, idx) => (
                    <div key={idx} className="flex gap-2 items-center" data-testid={`row-freelancer-${idx}`}>
                      <div className="text-xs font-medium text-muted-foreground w-20 shrink-0">Freelancer {idx + 1}</div>
                      <FreelancerPicker
                        value={m.freelancerName}
                        onChange={(v) => updateFreelancerRow(idx, { freelancerName: v })}
                        exclude={team.filter((_, i) => i !== idx).map((t) => t.freelancerName).filter(Boolean)}
                        preferredSpec={form.type === "Software" ? "Developer" : form.type === "Training" ? "Trainer" : undefined}
                        className="flex-1"
                        testId={`select-freelancer-${idx}`}
                      />
                      <Input
                        type="number"
                        placeholder="Commission EGP"
                        className="w-36"
                        value={m.commission}
                        onChange={(e) => updateFreelancerRow(idx, { commission: Number(e.target.value) || 0 })}
                        data-testid={`input-commission-${idx}`}
                      />
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeFreelancerRow(idx)} data-testid={`button-remove-freelancer-${idx}`}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs pt-1 border-t border-border/40">
                    <span className="text-muted-foreground">Total commissions</span>
                    <span className="font-semibold text-primary"><PrivacyWrapper value={team.reduce((s, m) => s + Number(m.commission || 0), 0)} /></span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Client Price (EGP)</Label>
              <Input data-testid="input-client-price" type="number" value={form.clientPrice} onChange={f("clientPrice")} />
            </div>
            <div className="space-y-1">
              <Label>Other Costs (EGP)</Label>
              <Input type="number" value={form.totalCost} onChange={f("totalCost")} />
            </div>
            <div className="space-y-1">
              <Label>Down Payment / Paid (EGP)</Label>
              <Input type="number" value={form.paidAmount} onChange={f("paidAmount")} data-testid="input-down-payment" />
            </div>
            <div className="space-y-1">
              <Label>Remaining (auto)</Label>
              <Input type="number" value={remainingPreview} readOnly className="bg-muted/40" />
            </div>

            <div className="md:col-span-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Down payment</span><span className="font-semibold">{downPaymentPct}% of price</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total freelancer cost</span><span><PrivacyWrapper value={team.reduce((s, m) => s + Number(m.commission || 0), 0)} /></span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estimated net profit</span><span className="text-green-500 font-semibold"><PrivacyWrapper value={Number(form.clientPrice) - Number(form.totalCost) - team.reduce((s, m) => s + Number(m.commission || 0), 0)} /></span></div>
            </div>

            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={f("startDate")} />
            </div>
            <div className="space-y-1">
              <Label>Deadline</Label>
              <Input type="date" value={form.deadline} onChange={f("deadline")} />
            </div>
            <div className="space-y-1">
              <Label>Next Payment Date</Label>
              <Input type="date" value={form.nextPaymentDate} onChange={f("nextPaymentDate")} />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={f("notes")} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
            <Button data-testid="button-save-project" onClick={handleSave} disabled={createProject.isPending || updateProject.isPending}>
              {(createProject.isPending || updateProject.isPending) ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Payment Dialog */}
      <Dialog open={!!paymentProject} onOpenChange={(v) => !v && setPaymentProject(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('projects.logPayment')} — {paymentProject?.projectName}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded border border-border p-3"><div className="text-muted-foreground text-xs">Price</div><div className="font-semibold"><PrivacyWrapper value={paymentProject?.clientPrice ?? 0} /></div></div>
              <div className="rounded border border-border p-3"><div className="text-muted-foreground text-xs">Already Paid</div><div className="font-semibold text-blue-400"><PrivacyWrapper value={paymentProject?.paidAmount ?? 0} /></div></div>
              <div className="col-span-2 rounded border border-destructive/30 bg-destructive/5 p-3"><div className="text-muted-foreground text-xs">Remaining</div><div className="font-semibold text-destructive"><PrivacyWrapper value={paymentProject?.remainingAmount ?? 0} /></div></div>
            </div>
            <div className="space-y-1">
              <Label>Amount Received (EGP)</Label>
              <Input data-testid="input-payment-amount" type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Next Payment Date (optional)</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentProject(null)}>Cancel</Button>
            <Button data-testid="button-confirm-payment" onClick={handleLogPayment} disabled={logPayment.isPending || !paymentAmount}>
              {logPayment.isPending ? "Saving..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('projects.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{t('common.deleteConfirmDesc')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" data-testid="button-confirm-delete">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
