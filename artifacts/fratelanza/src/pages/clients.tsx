import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListClients, getListClientsQueryKey, useCreateClient, useUpdateClient, useDeleteClient, useGetClient, getGetClientQueryKey } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react";

type Client = { id: number; name: string; phone?: string | null; address?: string | null; activity?: string | null; project?: string | null; notes?: string | null; };

const emptyForm = { name: "", phone: "", address: "", activity: "", project: "", notes: "" };

function ClientProfile({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: profile, isLoading } = useGetClient(id, { query: { queryKey: getGetClientQueryKey(id) } });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>360° Profile — {profile?.name}</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : profile && (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Projects", value: profile.totalProjects ?? 0, format: "number" as const },
                { label: "Total Value", value: profile.totalValue ?? 0, format: "currency" as const },
                { label: "Total Paid", value: profile.totalPaid ?? 0, format: "currency" as const },
                { label: "Remaining", value: profile.totalRemaining ?? 0, format: "currency" as const },
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
                <div className="text-sm font-semibold mb-2">Projects</div>
                <div className="rounded border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-card"><tr className="border-b border-border">{["Project", "Type", "Price", "Status"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      {profile.projects.map((p: { id: number; projectName: string; type: string; clientPrice: number; status: string }) => (
                        <tr key={p.id} className="border-b border-border"><td className="px-3 py-2">{p.projectName}</td><td className="px-3 py-2 text-muted-foreground">{p.type}</td><td className="px-3 py-2"><PrivacyWrapper value={p.clientPrice} /></td><td className="px-3 py-2">{p.status}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Clients() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);

  const { data: clients = [], isLoading } = useListClients();
  const create = useCreateClient();
  const update = useUpdateClient();
  const del = useDeleteClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListClientsQueryKey() });

  const filtered = (clients as Client[]).filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.activity ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setForm({ ...emptyForm }); setEditing(null); setShowForm(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm({ name: c.name, phone: c.phone ?? "", address: c.address ?? "", activity: c.activity ?? "", project: c.project ?? "", notes: c.notes ?? "" }); setShowForm(true); };

  const handleSave = () => {
    if (editing) {
      update.mutate({ id: editing.id, data: form } as Parameters<typeof update.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Client updated" }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    } else {
      create.mutate({ data: form } as Parameters<typeof create.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Client added" }); },
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

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        <Button onClick={openCreate} data-testid="button-add-client" className="bg-primary text-black hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> Add Client
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-search-clients" placeholder="Search clients..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {["Name", "Phone", "Activity", "Project", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No clients found</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} data-testid={`row-client-${c.id}`} className="border-b border-border hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.activity ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.project ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title="View 360 Profile" data-testid={`button-profile-${c.id}`} onClick={() => setProfileId(c.id)}><Eye className="h-4 w-4 text-primary" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Client" : "Add Client"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-1"><Label>Client Name</Label><Input data-testid="input-client-name" value={form.name} onChange={f("name")} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={f("phone")} /></div>
            <div className="space-y-1"><Label>Activity / Business</Label><Input value={form.activity} onChange={f("activity")} /></div>
            <div className="col-span-2 space-y-1"><Label>Address</Label><Input value={form.address} onChange={f("address")} /></div>
            <div className="col-span-2 space-y-1"><Label>Project / Service</Label><Input value={form.project} onChange={f("project")} /></div>
            <div className="col-span-2 space-y-1"><Label>Notes</Label><Textarea value={form.notes} onChange={f("notes")} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button data-testid="button-save-client" onClick={handleSave} disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Client?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
