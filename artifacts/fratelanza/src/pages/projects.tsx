import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects, getListProjectsQueryKey,
  useCreateProject, useUpdateProject, useDeleteProject, useLogPayment,
  useListFreelancers, useListClients,
} from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, DollarSign, Search, X, Users } from "lucide-react";
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
type PaymentTerm = { amount: number | string; dueDate: string; note: string; status: "Pending" | "Paid" };
type FreelancerPaymentTerm = PaymentTerm & { freelancerName: string };
type Freelancer = { code: string; name: string; spec?: string | null };

const STATUS_COLORS: Record<string, string> = {
  Ongoing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Completed: "bg-green-500/20 text-green-400 border-green-500/30",
  Cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};


function parseMoney(value: unknown): number {
  const normalized = String(value ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "");
  const firstDot = normalized.indexOf(".");
  const cleaned = firstDot === -1 ? normalized : normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyInput(value: string): string {
  const normalized = value.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const firstDot = normalized.indexOf(".");
  return firstDot === -1 ? normalized : normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
}

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
  const [clientReceivables, setClientReceivables] = useState<PaymentTerm[]>([]);
  const [freelancerPaymentTerms, setFreelancerPaymentTerms] = useState<FreelancerPaymentTerm[]>([]);
  const [pickFreelancer, setPickFreelancer] = useState<string>("");
  const [pickCommission, setPickCommission] = useState<string>("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [paymentProject, setPaymentProject] = useState<Project | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");

  const { data: projects = [], isLoading } = useListProjects();
  const { data: freelancers = [] } = useListFreelancers();
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

  const openCreate = () => { setForm({ ...empty }); setTeam([]); setClientReceivables([]); setFreelancerPaymentTerms([]); setEditing(null); setShowForm(true); };
  const openEdit = (p: Project) => {
    setEditing(p);
    setTeam([]);
    setClientReceivables([]);
    setFreelancerPaymentTerms([]);
    // Load team first, then back-compute "other costs" = stored totalCost − all commissions.
    const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
    fetch(`${apiBase}/projects/${p.id}/team`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((t: Array<{ freelancerName: string; commission: number }>) => {
        const teamLoaded = t.map((m) => ({ freelancerName: m.freelancerName, commission: Number(m.commission) }));
        setTeam(teamLoaded);
        const teamCommissionSum = teamLoaded.reduce((s, m) => s + m.commission, 0);
        const otherCosts = Math.max(0, Number(p.totalCost) - teamCommissionSum - Number(p.freelancerCommission ?? 0));
        setForm({ type: p.type, projectName: p.projectName, clientName: p.clientName ?? "", clientPrice: p.clientPrice, totalCost: otherCosts, netProfit: p.netProfit, freelancerName: p.freelancerName ?? "", freelancerCommission: p.freelancerCommission, startDate: p.startDate ?? "", deadline: p.deadline ?? "", status: p.status, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount, nextPaymentDate: p.nextPaymentDate ?? "", notes: p.notes ?? "" });
      })
      .catch(() => {
        // Fallback: no team, use stored totalCost minus lead commission only
        const otherCosts = Math.max(0, Number(p.totalCost) - Number(p.freelancerCommission ?? 0));
        setForm({ type: p.type, projectName: p.projectName, clientName: p.clientName ?? "", clientPrice: p.clientPrice, totalCost: otherCosts, netProfit: p.netProfit, freelancerName: p.freelancerName ?? "", freelancerCommission: p.freelancerCommission, startDate: p.startDate ?? "", deadline: p.deadline ?? "", status: p.status, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount, nextPaymentDate: p.nextPaymentDate ?? "", notes: p.notes ?? "" });
      });
    fetch(`${apiBase}/projects/${p.id}/payment-terms`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : { clientReceivables: [], freelancerPaymentTerms: [] })
      .then((terms: { clientReceivables?: PaymentTerm[]; freelancerPaymentTerms?: FreelancerPaymentTerm[] }) => {
        setClientReceivables((terms.clientReceivables ?? []).map((term) => ({ amount: Number(term.amount), dueDate: term.dueDate ?? "", note: term.note ?? "", status: term.status === "Paid" ? "Paid" : "Pending" })));
        setFreelancerPaymentTerms((terms.freelancerPaymentTerms ?? []).map((term) => ({ freelancerName: term.freelancerName, amount: Number(term.amount) || "", dueDate: term.dueDate ?? "", note: term.note ?? "", status: term.status === "Paid" ? "Paid" : "Pending" })));
      })
      .catch(() => { setClientReceivables([]); setFreelancerPaymentTerms([]); });
    setShowForm(true);
  };

  const addTeamMember = () => {
    if (!pickFreelancer) return;
    if (team.some((m) => m.freelancerName === pickFreelancer)) {
      toast({ title: "Already added", variant: "destructive" });
      return;
    }
    const commission = parseMoney(pickCommission);
    setTeam((prev) => [...prev, { freelancerName: pickFreelancer, commission }]);
    if (commission > 0) {
      setFreelancerPaymentTerms((prev) => [
        ...prev,
        { freelancerName: pickFreelancer, amount: String(commission), dueDate: "", note: "Commission payment", status: "Pending" },
      ]);
    }
    setPickFreelancer(""); setPickCommission("");
  };

  const removeTeamMember = (name: string) => {
    setTeam((prev) => prev.filter((m) => m.freelancerName !== name));
  };


  const updateClientReceivable = (index: number, patch: Partial<PaymentTerm>) => {
    setClientReceivables((prev) => prev.map((term, i) => i === index ? { ...term, ...patch } : term));
  };
  const updateFreelancerPaymentTerm = (index: number, patch: Partial<FreelancerPaymentTerm>) => {
    setFreelancerPaymentTerms((prev) => prev.map((term, i) => i === index ? { ...term, ...patch } : term));
  };
  const addClientReceivable = () => {
    setClientReceivables((prev) => [...prev, { amount: Math.max(0, remainingPreview), dueDate: form.nextPaymentDate || "", note: "Remaining payment", status: "Pending" }]);
  };
  const addFreelancerPaymentTerm = () => {
    const freelancerName = form.freelancerName || team[0]?.freelancerName || "";
    setFreelancerPaymentTerms((prev) => [...prev, { freelancerName, amount: "", dueDate: "", note: "Commission payment", status: "Pending" }]);
  };

  const handleSave = () => {
    const leadCommission = Math.max(0, parseMoney(form.freelancerCommission));
    const commissionedTeam = team
      .map((m) => ({ ...m, commission: Math.max(0, parseMoney(m.commission)) }))
      .filter((m) => m.commission > 0);
    const totalCommission = commissionedTeam.reduce((sum, member) => sum + member.commission, 0) + leadCommission;
    const normalizedFreelancerTerms = freelancerPaymentTerms
      .map((term) => ({ ...term, amount: parseMoney(term.amount) }))
      .filter((term) => term.freelancerName && term.amount > 0);
    const scheduledCommission = normalizedFreelancerTerms.reduce((sum, term) => sum + term.amount, 0);
    if (scheduledCommission > totalCommission) {
      toast({
        title: "Payment terms exceed freelancer commissions",
        description: "Reduce payment term amounts or increase the freelancer commission total.",
        variant: "destructive",
      });
      return;
    }
    const data = {
      ...form,
      clientPrice: Number(form.clientPrice),
      totalCost: Number(form.totalCost) + totalCommission,
      netProfit: Number(form.clientPrice) - (Number(form.totalCost) + totalCommission),
      paidAmount: Number(form.paidAmount),
      remainingAmount: Number(form.clientPrice) - Number(form.paidAmount),
      freelancerCommission: leadCommission,
      team: commissionedTeam,
      clientReceivables: clientReceivables.map((term) => ({ ...term, amount: parseMoney(term.amount) })).filter((term) => term.amount > 0),
      freelancerPaymentTerms: normalizedFreelancerTerms,
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
  const totalFreelancerCommission = Math.max(0, parseMoney(form.freelancerCommission)) + team.reduce((sum, member) => sum + Math.max(0, parseMoney(member.commission)), 0);
  const scheduledFreelancerPayments = freelancerPaymentTerms.reduce((sum, term) => sum + parseMoney(term.amount), 0);
  const paidRecognizedFreelancerCost = freelancerPaymentTerms.filter((term) => term.status === "Paid").reduce((sum, term) => sum + parseMoney(term.amount), 0);
  const freelancerPaymentOverscheduled = scheduledFreelancerPayments > totalFreelancerCommission;
  const freelancerPaymentNames = Array.from(new Set([form.freelancerName, ...team.map((m) => m.freelancerName)].filter(Boolean)));

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
            <div className="space-y-1">
              <Label>Client</Label>
              <Input data-testid="input-client-name" value={form.clientName} onChange={f("clientName")} />
            </div>
            <div className="space-y-1">
              <Label>Lead Freelancer</Label>
              <Select value={form.freelancerName || undefined} onValueChange={fs("freelancerName")}>
                <SelectTrigger><SelectValue placeholder="Select lead freelancer" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(freelancers as Freelancer[]).map((fr) => (
                    <SelectItem key={fr.code} value={fr.name}>{fr.name}{fr.spec ? ` — ${fr.spec}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Lead Commission (EGP) — optional</Label>
              <Input type="number" min="0" placeholder="Leave blank for no commission" value={form.freelancerCommission} onChange={(e) => setForm((prev) => ({ ...prev, freelancerCommission: moneyInput(e.target.value) as unknown as number }))} />
            </div>

            {/* Multi-freelancer team */}
            <div className="md:col-span-2 space-y-2 border border-border rounded-md p-3 bg-card/40">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" /> Additional Commissioned Freelancers
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={pickFreelancer || undefined} onValueChange={setPickFreelancer}>
                  <SelectTrigger className="flex-1 min-w-[200px]" data-testid="select-team-freelancer"><SelectValue placeholder="Select freelancer" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(freelancers as Freelancer[]).map((fr) => (
                      <SelectItem key={fr.code} value={fr.name}>{fr.name}{fr.spec ? ` — ${fr.spec}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min="0" placeholder="Commission EGP (optional)" className="w-48" value={pickCommission} onChange={(e) => setPickCommission(moneyInput(e.target.value))} data-testid="input-team-commission" />
                <Button type="button" variant="outline" onClick={addTeamMember} data-testid="button-add-team"><Plus className="h-4 w-4" /></Button>
              </div>
              {team.length > 0 && (
                <div className="space-y-1">
                  {team.map((m) => (
                    <div key={m.freelancerName} className="flex items-center justify-between px-3 py-2 rounded border border-border text-sm">
                      <span>{m.freelancerName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-primary font-medium"><PrivacyWrapper value={m.commission} /></span>
                        <button onClick={() => removeTeamMember(m.freelancerName)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                  ))}
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

            <div className="md:col-span-2 space-y-3 rounded-md border border-border bg-card/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Client receivables schedule</div>
                  <div className="text-xs text-muted-foreground">Split the remaining payment into dated receivable parts.</div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addClientReceivable}>Add receivable</Button>
              </div>
              {clientReceivables.length === 0 ? (
                <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">No receivable terms yet.</div>
              ) : clientReceivables.map((term, index) => (
                <div key={`client-receivable-${index}`} className="grid grid-cols-1 gap-2 rounded border border-border p-2 md:grid-cols-[1fr_1fr_2fr_auto]">
                  <Input type="number" min="0" placeholder="Amount" value={term.amount} onChange={(e) => updateClientReceivable(index, { amount: e.target.value })} />
                  <Input type="date" value={term.dueDate} onChange={(e) => updateClientReceivable(index, { dueDate: e.target.value })} />
                  <Input placeholder="Note" value={term.note} onChange={(e) => updateClientReceivable(index, { note: e.target.value })} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setClientReceivables((prev) => prev.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">Scheduled total: <PrivacyWrapper value={clientReceivables.reduce((sum, term) => sum + (Number(term.amount) || 0), 0)} /> / Remaining: <PrivacyWrapper value={Math.max(0, remainingPreview)} /></div>
            </div>

            <div className="md:col-span-2 space-y-3 rounded-md border border-border bg-card/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Freelancer commission payment terms</div>
                  <div className="text-xs text-muted-foreground">Add split payments here. Keep terms Pending until the freelancer actually receives the money.</div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addFreelancerPaymentTerm}>Add term</Button>
              </div>
              {freelancerPaymentTerms.length === 0 ? (
                <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">No freelancer payment terms yet.</div>
              ) : freelancerPaymentTerms.map((term, index) => (
                <div key={`freelancer-payment-${index}`} className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-muted-foreground">Payment split #{index + 1}</div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setFreelancerPaymentTerms((prev) => prev.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Freelancer</Label>
                      <Select value={term.freelancerName || undefined} onValueChange={(value) => updateFreelancerPaymentTerm(index, { freelancerName: value })}>
                        <SelectTrigger><SelectValue placeholder="Freelancer" /></SelectTrigger>
                        <SelectContent>
                          {freelancerPaymentNames.length === 0 ? <SelectItem value="__none" disabled>Select freelancer first</SelectItem> : freelancerPaymentNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Amount (EGP)</Label>
                      <Input inputMode="decimal" placeholder="e.g. 2000" value={term.amount} onChange={(e) => updateFreelancerPaymentTerm(index, { amount: moneyInput(e.target.value) })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Due date</Label>
                      <Input type="date" value={term.dueDate} onChange={(e) => updateFreelancerPaymentTerm(index, { dueDate: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select value={term.status} onValueChange={(status) => updateFreelancerPaymentTerm(index, { status: status as "Pending" | "Paid" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>Note</Label>
                      <Input placeholder="e.g. first installment" value={term.note} onChange={(e) => updateFreelancerPaymentTerm(index, { note: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">Scheduled freelancer payments: <PrivacyWrapper value={scheduledFreelancerPayments} /> / Commission total: <PrivacyWrapper value={totalFreelancerCommission} /> · Paid/recognized cost: <PrivacyWrapper value={paidRecognizedFreelancerCost} /></div>
              {freelancerPaymentOverscheduled && <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">Scheduled payment terms are higher than total freelancer commissions. Reduce the split amounts before saving.</div>}
            </div>

            <div className="md:col-span-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Down payment</span><span className="font-semibold">{downPaymentPct}% of price</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total freelancer cost</span><span><PrivacyWrapper value={totalFreelancerCommission} /></span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estimated net profit</span><span className="text-green-500 font-semibold"><PrivacyWrapper value={Number(form.clientPrice) - Number(form.totalCost) - totalFreelancerCommission} /></span></div>
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
