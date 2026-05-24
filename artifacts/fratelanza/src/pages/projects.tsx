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
import { Plus, Pencil, Trash2, DollarSign, Search } from "lucide-react";

type Project = {
  id: number; type: string; projectName: string; clientName?: string | null;
  clientPrice: number; totalCost: number; netProfit: number;
  freelancerName?: string | null; freelancerCommission: number;
  startDate?: string | null; deadline?: string | null;
  status: string; paidAmount: number; remainingAmount: number;
  nextPaymentDate?: string | null; notes?: string | null; date: string;
};

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
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...empty });
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

  const openCreate = () => { setForm({ ...empty }); setEditing(null); setShowForm(true); };
  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({ type: p.type, projectName: p.projectName, clientName: p.clientName ?? "", clientPrice: p.clientPrice, totalCost: p.totalCost, netProfit: p.netProfit, freelancerName: p.freelancerName ?? "", freelancerCommission: p.freelancerCommission, startDate: p.startDate ?? "", deadline: p.deadline ?? "", status: p.status, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount, nextPaymentDate: p.nextPaymentDate ?? "", notes: p.notes ?? "" });
    setShowForm(true);
  };

  const handleSave = () => {
    const data = { ...form, clientPrice: Number(form.clientPrice), totalCost: Number(form.totalCost), netProfit: Number(form.clientPrice) - Number(form.totalCost), paidAmount: Number(form.paidAmount), remainingAmount: Number(form.clientPrice) - Number(form.paidAmount), freelancerCommission: Number(form.freelancerCommission) };
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <Button onClick={openCreate} data-testid="button-create-project" className="bg-primary text-black hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> New Project
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-search-projects" placeholder="Search projects or clients..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter} data-testid="select-type-filter">
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Types</SelectItem>
            <SelectItem value="Software">Software</SelectItem>
            <SelectItem value="Training">Training</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter} data-testid="select-status-filter">
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Status</SelectItem>
            <SelectItem value="Ongoing">Ongoing</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading projects...</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {["Type", "Project Name", "Client", "Price", "Net Profit", "Paid", "Remaining", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No projects found</td></tr>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Project" : "New Project"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-1">
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
              <Input value={form.freelancerName} onChange={f("freelancerName")} />
            </div>
            <div className="space-y-1">
              <Label>Client Price (EGP)</Label>
              <Input data-testid="input-client-price" type="number" value={form.clientPrice} onChange={f("clientPrice")} />
            </div>
            <div className="space-y-1">
              <Label>Total Cost (EGP)</Label>
              <Input type="number" value={form.totalCost} onChange={f("totalCost")} />
            </div>
            <div className="space-y-1">
              <Label>Paid Amount (EGP)</Label>
              <Input type="number" value={form.paidAmount} onChange={f("paidAmount")} />
            </div>
            <div className="space-y-1">
              <Label>Freelancer Commission (EGP)</Label>
              <Input type="number" value={form.freelancerCommission} onChange={f("freelancerCommission")} />
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
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={f("notes")} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button data-testid="button-save-project" onClick={handleSave} disabled={createProject.isPending || updateProject.isPending}>
              {(createProject.isPending || updateProject.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Payment Dialog */}
      <Dialog open={!!paymentProject} onOpenChange={(v) => !v && setPaymentProject(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Payment — {paymentProject?.projectName}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">Remaining: <span className="text-red-400 font-semibold"><PrivacyWrapper value={paymentProject?.remainingAmount ?? 0} /></span></div>
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

      {/* Delete Alert */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Project?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" data-testid="button-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
