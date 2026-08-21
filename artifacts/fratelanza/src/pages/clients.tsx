import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListClients,
  useCreateClient, useUpdateClient, useDeleteClient,
  useGetClient, getGetClientQueryKey,
  useListClientActivities,
} from "@workspace/api-client-react";
import type { ListClientsParams, Project } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Eye, Download } from "lucide-react";
import { useTranslation } from "react-i18next";

type Client = {
  id: number; name: string; phone?: string | null; address?: string | null;
  activity?: string | null; project?: string | null; notes?: string | null;
  active?: boolean; projectCount?: number; totalValue?: number;
  totalPaid?: number; totalRemaining?: number;
};

const emptyForm = { name: "", phone: "", address: "", activity: "", project: "", notes: "", active: true };

function ClientProfile({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useGetClient(id, { query: { queryKey: getGetClientQueryKey(id) } });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            360° — {profile?.name}
            {profile?.active === false && <Badge variant="outline" className="text-red-400 border-red-500/40">{t("clients.inactive")}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">{t("common.loading")}</div>
        ) : profile && (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t("clients.projectsCount"), value: profile.totalProjects ?? 0, format: "number" as const },
                { label: t("clients.totalRevenue"), value: profile.totalValue ?? 0, format: "currency" as const },
                { label: t("clients.totalPaid"), value: profile.totalPaid ?? 0, format: "currency" as const },
                { label: t("clients.totalRemaining"), value: profile.totalRemaining ?? 0, format: "currency" as const },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-lg bg-card p-4 border border-border text-center">
                  <div className="text-xs text-muted-foreground mb-1">{kpi.label}</div>
                  <div className="text-xl font-bold text-foreground"><PrivacyWrapper value={kpi.value} format={kpi.format} /></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Phone", profile.phone], ["Address", profile.address], ["Activity", profile.activity], ["Project", profile.project]].map(([k, v]) => (
                <div key={k as string} className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div>{v ?? "—"}</div>
                </div>
              ))}
              {profile.notes && <div className="col-span-2 space-y-0.5"><div className="text-xs text-muted-foreground">Notes</div><div>{profile.notes}</div></div>}
            </div>
            {profile.projects && profile.projects.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-2">{t("clients.projectsList")}</div>
                <div className="rounded border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-card">
                      <tr className="border-b border-border">
                        {[t("projects.projectName"), t("common.type"), t("projects.price"), t("projects.paid"), t("projects.remaining"), t("common.status")].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-xs text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(profile.projects as Project[]).map((p) => (
                        <tr key={p.id} className="border-b border-border">
                          <td className="px-3 py-2">{p.projectName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{p.type}</td>
                          <td className="px-3 py-2"><PrivacyWrapper value={p.clientPrice} /></td>
                          <td className="px-3 py-2 text-blue-400"><PrivacyWrapper value={p.paidAmount} /></td>
                          <td className="px-3 py-2 text-red-400"><PrivacyWrapper value={p.remainingAmount} /></td>
                          <td className="px-3 py-2">{p.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>{t("common.close", { defaultValue: "Close" })}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Clients() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const listParams = useMemo((): ListClientsParams => ({
    search: search || undefined,
    activity: activityFilter !== "all" ? activityFilter : undefined,
    active: activeFilter !== "all" ? (activeFilter as ListClientsParams["active"]) : undefined,
    payment: paymentFilter !== "all" ? (paymentFilter as ListClientsParams["payment"]) : undefined,
  }), [search, activityFilter, activeFilter, paymentFilter]);

  const { data: clients = [], isLoading } = useListClients(listParams);
  const { data: activities = [] } = useListClientActivities();
  const create = useCreateClient();
  const update = useUpdateClient();
  const del = useDeleteClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/clients"] });

  const openCreate = () => { setForm({ ...emptyForm }); setEditing(null); setShowForm(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name, phone: c.phone ?? "", address: c.address ?? "",
      activity: c.activity ?? "", project: c.project ?? "", notes: c.notes ?? "",
      active: c.active !== false,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    const payload = { ...form };
    if (editing) {
      update.mutate({ id: editing.id, data: payload } as Parameters<typeof update.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: t("clients.updated") }); },
        onError: () => toast({ title: t("common.error"), variant: "destructive" }),
      });
    } else {
      create.mutate({ data: payload } as Parameters<typeof create.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: t("clients.created") }); },
        onError: () => toast({ title: t("common.error"), variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (deleteId === null) return;
    del.mutate({ id: deleteId } as Parameters<typeof del.mutate>[0], {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: t("clients.deleted") }); },
      onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    });
  };

  const toggleActive = (c: Client, next: boolean) => {
    update.mutate({ id: c.id, data: { active: next } } as Parameters<typeof update.mutate>[0], {
      onSuccess: () => { invalidate(); toast({ title: next ? t("clients.activated") : t("clients.deactivated") }); },
      onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    });
  };

  const exportExcel = async () => {
    setExporting(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (activityFilter !== "all") qs.set("activity", activityFilter);
    if (activeFilter !== "all") qs.set("active", activeFilter);
    if (paymentFilter !== "all") qs.set("payment", paymentFilter);
    const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
    try {
      const r = await fetch(`${apiBase}/clients/export?${qs.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error("Export failed");
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "clients.xlsx";
      link.click();
      URL.revokeObjectURL(link.href);
      toast({ title: t("clients.exportDone") });
    } catch (err) {
      toast({ title: t("clients.exportFailed"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">{t("clients.title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={exporting} data-testid="button-export-clients">
            <Download className="h-4 w-4 me-2" /> {exporting ? t("clients.exporting") : t("clients.exportExcel")}
          </Button>
          <Button onClick={openCreate} data-testid="button-add-client" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 me-2" /> {t("clients.new")}
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-search-clients" placeholder={t("clients.searchPlaceholder")} className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={activityFilter} onValueChange={setActivityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("clients.filterActivity")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("clients.allActivities")}</SelectItem>
            {(activities as string[]).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("clients.allStatus")}</SelectItem>
            <SelectItem value="active">{t("clients.activeOnly")}</SelectItem>
            <SelectItem value="inactive">{t("clients.inactiveOnly")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("clients.allPayments")}</SelectItem>
            <SelectItem value="outstanding">{t("clients.hasOutstanding")}</SelectItem>
            <SelectItem value="paid">{t("clients.fullyPaid")}</SelectItem>
            <SelectItem value="no_projects">{t("clients.noProjects")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {[t("clients.company"), t("clients.phone"), t("clients.industry"), t("clients.projectsCount"), t("clients.totalRevenue"), t("clients.totalPaid"), t("clients.totalRemaining"), t("clients.active"), t("clients.actions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(clients as Client[]).length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">{t("clients.noClients")}</td></tr>
              ) : (clients as Client[]).map((c) => (
                <tr key={c.id} data-testid={`row-client-${c.id}`} className={`border-b border-border hover:bg-card/50 transition-colors ${c.active === false ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {c.name}
                      {c.active === false && <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30">{t("clients.inactive")}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.activity ?? "—"}</td>
                  <td className="px-4 py-3">{c.projectCount ?? 0}</td>
                  <td className="px-4 py-3"><PrivacyWrapper value={c.totalValue ?? 0} /></td>
                  <td className="px-4 py-3 text-blue-400"><PrivacyWrapper value={c.totalPaid ?? 0} /></td>
                  <td className="px-4 py-3 text-red-400"><PrivacyWrapper value={c.totalRemaining ?? 0} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.active !== false}
                        onCheckedChange={(v) => toggleActive(c, v)}
                        data-testid={`switch-active-${c.id}`}
                      />
                      <span className="text-xs text-muted-foreground">{c.active !== false ? t("clients.active") : t("clients.inactive")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title="360 Profile" data-testid={`button-profile-${c.id}`} onClick={() => setProfileId(c.id)}><Eye className="h-4 w-4 text-primary" /></Button>
                      <Button size="icon" variant="ghost" data-testid={`button-edit-${c.id}`} onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" data-testid={`button-delete-${c.id}`} onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {profileId !== null && <ClientProfile id={profileId} onClose={() => setProfileId(null)} />}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t("clients.edit") : t("clients.new")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-1"><Label>{t("clients.company")}</Label><Input data-testid="input-client-name" value={form.name} onChange={f("name")} /></div>
            <div className="space-y-1"><Label>{t("clients.phone")}</Label><Input value={form.phone} onChange={f("phone")} /></div>
            <div className="space-y-1"><Label>{t("clients.industry")}</Label><Input value={form.activity} onChange={f("activity")} /></div>
            <div className="col-span-2 space-y-1"><Label>{t("clients.address")}</Label><Input value={form.address} onChange={f("address")} /></div>
            <div className="col-span-2 space-y-1"><Label>{t("clients.projectField")}</Label><Input value={form.project} onChange={f("project")} /></div>
            <div className="col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label>{t("clients.active")}</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((prev) => ({ ...prev, active: v }))} />
            </div>
            <div className="col-span-2 space-y-1"><Label>{t("clients.notes")}</Label><Textarea value={form.notes} onChange={f("notes")} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-save-client" onClick={handleSave} disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? t("common.saving") : t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("clients.deleteTitle")}</AlertDialogTitle><AlertDialogDescription>{t("common.deleteConfirmDesc")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
