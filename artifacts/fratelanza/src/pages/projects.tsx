import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects, getListProjectsQueryKey,
  useCreateProject, useUpdateProject, useDeleteProject,
  useListClients,
} from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { FreelancerPicker } from "@/components/freelancer-picker";
import { ProjectPaymentDialog } from "@/components/project-payment-dialog";
import { ProjectDocumentsPanel, type ClientQuoteSummary } from "@/components/project-documents-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, DollarSign, Search, X, Users, UserPlus, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

type Project = {
  id: number; type: string; projectName: string; clientName?: string | null;
  clientPrice: number; totalCost: number; netProfit: number;
  freelancerName?: string | null; freelancerCommission: number;
  teamFreelancers?: string[];
  startDate?: string | null; deadline?: string | null;
  status: string; paidAmount: number; remainingAmount: number;
  nextPaymentDate?: string | null; notes?: string | null; date: string;
  technicalOutline?: string | null; generatedReport?: string | null;
  quoteId?: number | null; outlineFileName?: string | null; hasOutlineFile?: boolean;
  freelancersCost?: number; otherCosts?: number; freelancersOwed?: number;
  toFreelancers?: number; fratelanzaShare?: number;
};

type View = "all" | "outstanding" | "overdue";
const initialView = (): View => {
  try {
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "outstanding" || v === "overdue" ? v : "all";
  } catch { return "all"; }
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
  technicalOutline: "", generatedReport: "", quoteId: null as number | null,
  hasOutlineFile: false, outlineFileName: "",
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
  const [paymentTab, setPaymentTab] = useState<"client" | "freelancers">("client");
  const [view, setView] = useState<View>(initialView);
  const todayIso = new Date().toISOString().slice(0, 10);
  const isOverdue = (p: Project) => p.remainingAmount > 0 && p.status !== "Cancelled" && !!p.nextPaymentDate && p.nextPaymentDate < todayIso;
  const openPayments = (p: Project, tab: "client" | "freelancers") => { setPaymentTab(tab); setPaymentProject(p); };

  const { data: projects = [], isLoading } = useListProjects();
  const { data: clients = [] } = useListClients();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });

  const filtered = (projects as Project[]).filter((p) => {
    const matchType = typeFilter === "All" || p.type === typeFilter;
    const matchStatus = statusFilter === "All" || p.status === statusFilter;
    const matchSearch = !search || p.projectName.toLowerCase().includes(search.toLowerCase()) || (p.clientName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchView = view === "all"
      || (view === "outstanding" && p.remainingAmount > 0 && p.status !== "Cancelled")
      || (view === "overdue" && isOverdue(p));
    return matchType && matchStatus && matchSearch && matchView;
  });
  const outstanding = (projects as Project[]).filter((p) => p.remainingAmount > 0 && p.status !== "Cancelled");
  const overdue = outstanding.filter(isOverdue);
  const sum = (list: Project[]) => list.reduce((s, p) => s + Number(p.remainingAmount), 0);

  const openCreate = () => { setForm({ ...empty }); setTeam([]); setEditing(null); setShowForm(true); };

  const applyProjectToForm = (p: Project, teamLoaded: TeamMember[]) => {
    setTeam(teamLoaded);
    const teamCommissionSum = teamLoaded.reduce((s, m) => s + m.commission, 0);
    const legacyLeadCommission = p.freelancerName ? 0 : Number(p.freelancerCommission ?? 0);
    const otherCosts = Math.max(0, Number(p.totalCost) - teamCommissionSum - legacyLeadCommission);
    setForm({
      type: p.type, projectName: p.projectName, clientName: p.clientName ?? "",
      clientPrice: p.clientPrice, totalCost: otherCosts, netProfit: p.netProfit,
      freelancerName: "", freelancerCommission: 0,
      startDate: p.startDate ?? "", deadline: p.deadline ?? "", status: p.status,
      paidAmount: p.paidAmount, remainingAmount: p.remainingAmount,
      nextPaymentDate: p.nextPaymentDate ?? "", notes: p.notes ?? "",
      technicalOutline: p.technicalOutline ?? "", generatedReport: p.generatedReport ?? "",
      quoteId: p.quoteId ?? null, hasOutlineFile: Boolean(p.hasOutlineFile),
      outlineFileName: p.outlineFileName ?? "",
    });
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setTeam([]);
    const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
    Promise.all([
      fetch(`${apiBase}/projects/${p.id}`, { credentials: "include" }).then((r) => r.ok ? r.json() : p),
      fetch(`${apiBase}/projects/${p.id}/team`, { credentials: "include" }).then((r) => r.ok ? r.json() : []),
    ]).then(([detail, teamRows]: [Project, Array<{ freelancerName: string; commission: number }>]) => {
      const teamLoaded: TeamMember[] = teamRows.map((m) => ({ freelancerName: m.freelancerName, commission: Number(m.commission) }));
      const lead = detail.freelancerName ?? p.freelancerName;
      if (lead && !teamLoaded.some((m) => m.freelancerName === lead)) {
        teamLoaded.unshift({ freelancerName: lead, commission: Number(detail.freelancerCommission ?? p.freelancerCommission ?? 0) });
      }
      applyProjectToForm(detail, teamLoaded);
    }).catch(() => {
      const teamLoaded: TeamMember[] = p.freelancerName
        ? [{ freelancerName: p.freelancerName, commission: Number(p.freelancerCommission ?? 0) }]
        : [];
      applyProjectToForm(p, teamLoaded);
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
    const { hasOutlineFile, outlineFileName, freelancerName, freelancerCommission, ...formData } = form;
    const data = {
      ...formData,
      clientPrice: Number(form.clientPrice),
      totalCost: Number(form.totalCost) + totalCommission,
      netProfit: Number(form.clientPrice) - (Number(form.totalCost) + totalCommission),
      paidAmount: Number(form.paidAmount),
      remainingAmount: Number(form.clientPrice) - Number(form.paidAmount),
      freelancerName: leadName,
      freelancerCommission: leadCommission,
      team: cleanTeam.slice(1).map((m) => ({ freelancerName: m.freelancerName, commission: Number(m.commission || 0) })),
      technicalOutline: form.technicalOutline || null,
      generatedReport: form.generatedReport || null,
      quoteId: form.quoteId,
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

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const fs = (k: string) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleQuoteLink = (quote: ClientQuoteSummary, importPrice: boolean) => {
    setForm((prev) => ({
      ...prev,
      quoteId: quote.id,
      ...(importPrice && quote.price > 0
        ? {
            clientPrice: quote.price,
            remainingAmount: quote.price - Number(prev.paidAmount),
            netProfit: quote.price - Number(prev.totalCost),
          }
        : {}),
    }));
  };

  const downPaymentPct = form.clientPrice > 0 ? Math.round((Number(form.paidAmount) / Number(form.clientPrice)) * 100) : 0;
  const remainingPreview = Math.max(0, Number(form.clientPrice) - Number(form.paidAmount));
  const profitPreview = Number(form.clientPrice) - Number(form.totalCost) - team.reduce((s, m) => s + Number(m.commission || 0), 0);
  const marginPreview = Number(form.clientPrice) > 0 ? Math.round((profitPreview / Number(form.clientPrice)) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">{t('projects.title')}</h1>
        <Button onClick={openCreate} data-testid="button-create-project" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 me-2" /> {t('projects.new')}
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {([
          ["all", t("projects.viewAll"), (projects as Project[]).length, null],
          ["outstanding", t("projects.viewOutstanding"), outstanding.length, sum(outstanding)],
          ["overdue", t("projects.viewOverdue"), overdue.length, sum(overdue)],
        ] as [View, string, number, number | null][]).map(([key, label, count, total]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            data-testid={`view-${key}`}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${view === key ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-card"} ${key === "overdue" && count > 0 && view !== key ? "border-red-500/40 text-red-400" : ""}`}
          >
            <span className="font-medium">{label}</span> <span className="text-muted-foreground">({count})</span>
            {total !== null && total > 0 && <span className="ms-2 font-semibold"><PrivacyWrapper value={total} /></span>}
          </button>
        ))}
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
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {[t('projects.projectName'), t('projects.colDeal'), t('projects.colCollection'), t('projects.colSplit'), t('common.status'), t('projects.actions')].map((h) => (
                  <th key={h} className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{t('projects.noProjects')}</td></tr>
              ) : filtered.map((p) => {
                const freelancerNames = (p.teamFreelancers && p.teamFreelancers.length > 0)
                  ? p.teamFreelancers
                  : (p.freelancerName ? [p.freelancerName] : []);
                const freelancersCost = p.freelancersCost ?? 0;
                const otherCosts = p.otherCosts ?? Math.max(0, p.totalCost - freelancersCost);
                const pctPaid = p.clientPrice > 0 ? Math.min(100, Math.round((p.paidAmount / p.clientPrice) * 100)) : 0;
                const late = isOverdue(p);
                return (
                <tr key={p.id} data-testid={`row-project-${p.id}`} className={`border-b border-border hover:bg-card/50 transition-colors align-top ${late ? "bg-red-500/5" : ""}`}>
                  <td className="px-4 py-3 min-w-[220px]">
                    <div className="flex items-center gap-1.5 font-medium">
                      {p.projectName}
                      {(p.hasOutlineFile || p.technicalOutline || p.quoteId) && (
                        <span title={t("projects.hasDocuments")}><FileText className="h-3.5 w-3.5 text-primary shrink-0" /></span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.clientName ?? "—"}</div>
                    <div className="mt-1 flex flex-wrap gap-1 max-w-[240px]">
                      <Badge variant="outline" className={`text-[10px] ${p.type === "Software" ? "text-blue-400 border-blue-500/30" : "text-yellow-400 border-yellow-500/30"}`}>{p.type}</Badge>
                      {freelancerNames.map((name) => (
                        <Badge key={name} variant="outline" className="text-[10px] text-primary border-primary/30">{name}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs" data-testid={`deal-${p.id}`}>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projects.price')}</span><span className="font-semibold text-sm"><PrivacyWrapper value={p.clientPrice} /></span></div>
                    <div className="flex justify-between gap-3 text-muted-foreground"><span>− {t('projects.freelancersCost')}</span><PrivacyWrapper value={freelancersCost} /></div>
                    {otherCosts > 0 && <div className="flex justify-between gap-3 text-muted-foreground"><span>− {t('projects.otherCostsShort')}</span><PrivacyWrapper value={otherCosts} /></div>}
                    <div className={`flex justify-between gap-3 border-t border-border/60 mt-0.5 pt-0.5 font-semibold ${p.netProfit < 0 ? "text-red-400" : "text-green-400"}`}><span>= {t('projects.projectNet')}</span><PrivacyWrapper value={p.netProfit} /></div>
                  </td>
                  <td className="px-4 py-3 min-w-[190px] text-xs">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-1"><div className="h-full bg-blue-500" style={{ width: `${pctPaid}%` }} /></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projects.paid')} ({pctPaid}%)</span><span className="text-blue-400 font-semibold"><PrivacyWrapper value={p.paidAmount} /></span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projects.remaining')}</span><span className={p.remainingAmount > 0 ? "text-orange-400 font-semibold" : "text-muted-foreground"}><PrivacyWrapper value={p.remainingAmount} /></span></div>
                    {p.remainingAmount > 0 && p.nextPaymentDate && (
                      <div className={`mt-0.5 ${late ? "text-red-400 font-semibold" : "text-muted-foreground"}`}>{t('projects.nextDue')}: {p.nextPaymentDate}{late ? ` · ${t('projects.overdue')}` : ""}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">{t('projects.givenToFreelancers')}</span><PrivacyWrapper value={p.toFreelancers ?? 0} /></div>
                    {(p.freelancersOwed ?? 0) > 0 && <div className="flex justify-between gap-3 text-orange-400"><span>{t('projects.stillOwedFreelancers')}</span><PrivacyWrapper value={p.freelancersOwed ?? 0} /></div>}
                    <div className={`flex justify-between gap-3 font-semibold ${(p.fratelanzaShare ?? 0) < 0 ? "text-red-400" : "text-green-400"}`}><span>{t('projects.fratelanzaShare')}</span><PrivacyWrapper value={p.fratelanzaShare ?? 0} /></div>
                  </td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[p.status] ?? "bg-gray-500/20 text-gray-400"}`}>{p.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <Button size="sm" variant="outline" className="h-7 border-green-500/30 text-green-500 hover:bg-green-500/10" data-testid={`button-pay-${p.id}`} onClick={() => openPayments(p, "client")}>
                        <DollarSign className="h-3 w-3 me-1" />{t('projects.receivePayment')}
                      </Button>
                      {freelancerNames.length > 0 && (
                        <Button size="sm" variant="outline" className="h-7" data-testid={`button-pay-freelancer-${p.id}`} onClick={() => openPayments(p, "freelancers")}>
                          <Users className="h-3 w-3 me-1" />{t('projects.payFreelancer')}
                        </Button>
                      )}
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-edit-${p.id}`} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-delete-${p.id}`} onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
              <Label>{t('projects.clientName')}</Label>
              <Select value={form.clientName} onValueChange={fs("clientName")}>
                <SelectTrigger data-testid="input-client-name"><SelectValue placeholder={t('projects.selectClient')} /></SelectTrigger>
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
              <Label>{t('projects.otherCostsLabel')}</Label>
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
              <div className="flex justify-between"><span className="text-muted-foreground">{t('projects.price')}</span><span><PrivacyWrapper value={Number(form.clientPrice)} /></span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">− {t('projects.freelancersCost')}</span><span><PrivacyWrapper value={team.reduce((s, m) => s + Number(m.commission || 0), 0)} /></span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">− {t('projects.otherCostsShort')}</span><span><PrivacyWrapper value={Number(form.totalCost)} /></span></div>
              <div className="flex justify-between border-t border-border/60 pt-1"><span className="font-medium">= {t('projects.projectNet')}</span><span className={`font-semibold ${profitPreview < 0 ? "text-red-400" : "text-green-500"}`}>{profitPreview < 0 ? "- " : ""}<PrivacyWrapper value={Math.abs(profitPreview)} /> ({marginPreview}%)</span></div>
              {profitPreview < 0 && (
                <div className="text-xs text-red-400">This project costs more than the client pays — it will lose money.</div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={f("startDate")} />
            </div>
            <div className="space-y-1">
              <Label>Deadline</Label>
              <Input type="date" value={form.deadline} onChange={f("deadline")} />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Next Payment Date</Label>
              <Input type="date" value={form.nextPaymentDate} onChange={f("nextPaymentDate")} />
            </div>

            <ProjectDocumentsPanel
              projectId={editing?.id}
              clientName={form.clientName}
              technicalOutline={form.technicalOutline}
              generatedReport={form.generatedReport}
              quoteId={form.quoteId}
              outlineFileName={form.outlineFileName}
              hasOutlineFile={form.hasOutlineFile}
              onOutlineChange={(v) => setForm((prev) => ({ ...prev, technicalOutline: v }))}
              onReportChange={(v) => setForm((prev) => ({ ...prev, generatedReport: v }))}
              onQuoteLink={handleQuoteLink}
              onFileUploaded={(name) => setForm((prev) => ({ ...prev, outlineFileName: name, hasOutlineFile: true }))}
            />

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

      <ProjectPaymentDialog
        project={paymentProject}
        open={!!paymentProject}
        onOpenChange={(v) => !v && setPaymentProject(null)}
        onSuccess={invalidate}
        initialTab={paymentTab}
      />

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
