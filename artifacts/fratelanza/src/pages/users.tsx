import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  getListUsersQueryKey,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ShieldCheck, Eye } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type UserRow = {
  id: number;
  username: string;
  role: string;
  pagePermissions: string[];
  createdAt: string;
};

const ALL_PAGES: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "projects", label: "Projects" },
  { key: "receivables", label: "Receivables" },
  { key: "freelancers", label: "Freelancers" },
  { key: "clients", label: "Clients" },
  { key: "templates", label: "Templates" },
  { key: "quotes", label: "Quotes" },
  { key: "expenses", label: "Expenses" },
  { key: "tasks", label: "Tasks" },
  { key: "finance", label: "Finance" },
  { key: "settings", label: "Settings" },
];

const emptyForm = {
  username: "",
  password: "",
  role: "admin" as "admin" | "viewer",
  pagePermissions: [] as string[],
};

export default function UsersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { state } = useAuth();
  const currentUserName = state.status === "auth" ? state.username : "";

  const { data: users = [], isLoading } = useListUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setForm({
      username: u.username,
      password: "",
      role: (u.role === "viewer" ? "viewer" : "admin"),
      pagePermissions: u.pagePermissions ?? [],
    });
    setShowForm(true);
  };

  const togglePerm = (key: string) => {
    setForm((f) => ({
      ...f,
      pagePermissions: f.pagePermissions.includes(key)
        ? f.pagePermissions.filter((k) => k !== key)
        : [...f.pagePermissions, key],
    }));
  };

  const handleSave = () => {
    if (!form.username.trim()) {
      toast({ title: "Username is required", variant: "destructive" });
      return;
    }
    if (!editing && form.password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    const payload = {
      username: form.username.trim(),
      role: form.role,
      pagePermissions: form.role === "admin" ? [] : form.pagePermissions,
    };

    if (editing) {
      const data: Record<string, unknown> = { ...payload };
      if (form.password.length > 0) data.password = form.password;
      update.mutate(
        { id: editing.id, data: data as Parameters<typeof update.mutate>[0]["data"] } as Parameters<typeof update.mutate>[0],
        {
          onSuccess: () => {
            invalidate();
            setShowForm(false);
            toast({ title: "User updated" });
          },
          onError: (e: unknown) => {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error updating user";
            toast({ title: msg, variant: "destructive" });
          },
        },
      );
    } else {
      create.mutate(
        { data: { ...payload, password: form.password } } as Parameters<typeof create.mutate>[0],
        {
          onSuccess: () => {
            invalidate();
            setShowForm(false);
            toast({ title: "User created" });
          },
          onError: (e: unknown) => {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error creating user";
            toast({ title: msg, variant: "destructive" });
          },
        },
      );
    }
  };

  const handleDelete = () => {
    if (deleteId == null) return;
    del.mutate({ id: deleteId } as Parameters<typeof del.mutate>[0], {
      onSuccess: () => {
        invalidate();
        setDeleteId(null);
        toast({ title: "User deleted" });
      },
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Cannot delete";
        toast({ title: msg, variant: "destructive" });
        setDeleteId(null);
      },
    });
  };

  const rows = useMemo(() => (users as UserRow[]) ?? [], [users]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Manage accounts, roles and per-page access</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-user">
          <Plus className="me-2 h-4 w-4" /> Add user
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start p-3 font-medium">Username</th>
              <th className="text-start p-3 font-medium">Role</th>
              <th className="text-start p-3 font-medium">Pages</th>
              <th className="text-end p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No users</td></tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-border" data-testid={`row-user-${u.id}`}>
                <td className="p-3 font-medium">
                  {u.username}
                  {u.username === currentUserName && (
                    <Badge variant="outline" className="ms-2">you</Badge>
                  )}
                </td>
                <td className="p-3">
                  {u.role === "admin" ? (
                    <Badge className="bg-primary/15 text-primary border-primary/30"><ShieldCheck className="me-1 h-3 w-3" />Admin</Badge>
                  ) : (
                    <Badge variant="secondary"><Eye className="me-1 h-3 w-3" />Viewer</Badge>
                  )}
                </td>
                <td className="p-3 text-muted-foreground">
                  {u.role === "admin"
                    ? "All pages"
                    : u.pagePermissions.length === 0
                    ? <span className="text-destructive">No pages assigned</span>
                    : u.pagePermissions.join(", ")}
                </td>
                <td className="p-3 text-end">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(u)} data-testid={`button-edit-${u.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(u.id)}
                    disabled={u.username === currentUserName}
                    data-testid={`button-delete-${u.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                data-testid="input-user-username"
              />
            </div>
            <div className="space-y-1">
              <Label>{editing ? "New password (leave blank to keep)" : "Password (min 6 chars)"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                data-testid="input-user-password"
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as "admin" | "viewer" }))}>
                <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                  <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.role === "admin"
                  ? "Admins can see and edit every page."
                  : "Viewers can only read the pages you select below — no editing."}
              </p>
            </div>

            {form.role === "viewer" && (
              <div className="space-y-2">
                <Label>Allowed pages</Label>
                <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                  {ALL_PAGES.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.pagePermissions.includes(p.key)}
                        onCheckedChange={() => togglePerm(p.key)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending} data-testid="button-save-user">
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
