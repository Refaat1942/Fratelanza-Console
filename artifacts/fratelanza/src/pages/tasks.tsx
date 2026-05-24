import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListTasks, getListTasksQueryKey, useCreateTask, useUpdateTask, useDeleteTask } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Plus, Pencil, Trash2, MoveRight, Users, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";

type RecipientType = "team_member" | "freelancer";
type TaskRecipient = { type: RecipientType; id: string; name: string; category: "Team Members" | "Freelancers"; value?: string };
type Task = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  projectName?: string | null;
  assignedTo?: string | null;
  assigneeType?: RecipientType | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeValue?: string | null;
  ccRecipients?: TaskRecipient[];
  dueDate?: string | null;
  lastStatusAt?: string | null;
  createdAt: string;
};
type Activity = { id: number; action: string; actor?: string | null; fromStatus?: string | null; toStatus?: string | null; details?: string | null; createdAt: string };
type AssigneesResponse = { teamMembers: TaskRecipient[]; freelancers: TaskRecipient[] };

const COLUMNS = ["To Do", "In Progress", "Done"];
const NONE = "__none";

const PRIORITY_COLORS: Record<string, string> = {
  High: "bg-red-500/20 text-red-400 border-red-500/30",
  Medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Low: "bg-green-500/20 text-green-400 border-green-500/30",
};

const emptyForm = {
  title: "",
  description: "",
  status: "To Do",
  priority: "Medium",
  projectName: "",
  assigneeValue: NONE,
  ccRecipients: [] as string[],
  dueDate: "",
};

const valueFor = (r: Pick<TaskRecipient, "type" | "id">) => `${r.type}:${r.id}`;

export default function Tasks() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { apiBase } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: tasks = [], isLoading } = useListTasks();
  const create = useCreateTask();
  const update = useUpdateTask();
  const del = useDeleteTask();

  const assignees = useQuery({
    queryKey: ["task-assignees"],
    queryFn: async (): Promise<AssigneesResponse> => {
      const res = await fetch(`${apiBase}/task-assignees`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load assignees");
      return res.json();
    },
  });

  const activity = useQuery({
    queryKey: ["task-activity", editing?.id],
    enabled: Boolean(editing?.id),
    queryFn: async (): Promise<Activity[]> => {
      const res = await fetch(`${apiBase}/tasks/${editing!.id}/activity`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load task activity");
      return res.json();
    },
  });

  const allAssignees = [
    ...(assignees.data?.teamMembers ?? []).map((r) => ({ ...r, value: r.value ?? valueFor(r) })),
    ...(assignees.data?.freelancers ?? []).map((r) => ({ ...r, value: r.value ?? valueFor(r) })),
  ];
  const selectedAssignee = allAssignees.find((a) => a.value === form.assigneeValue) ?? null;
  const ccOptions = allAssignees.filter((a) => a.value !== form.assigneeValue);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
    qc.invalidateQueries({ queryKey: ["task-notifications"] });
  };

  const normalizedStatus = (status: string) => (status === "Todo" ? "To Do" : status);
  const allTasks = (tasks as Task[]).map((task) => ({ ...task, status: normalizedStatus(task.status) }));
  const tasksByStatus = (status: string) => allTasks.filter((task) => task.status === status);
  const totalTasks = allTasks.length;
  const openTasks = allTasks.filter((task) => task.status !== "Done").length;
  const highPriorityTasks = allTasks.filter((task) => task.priority === "High" && task.status !== "Done").length;
  const completedTasks = allTasks.filter((task) => task.status === "Done").length;

  const openCreate = (status = "To Do") => {
    setForm({ ...emptyForm, status });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (task: Task) => {
    const assigneeValue = task.assigneeValue ?? (task.assigneeType && task.assigneeId ? valueFor({ type: task.assigneeType, id: task.assigneeId }) : NONE);
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      status: normalizedStatus(task.status),
      priority: task.priority ?? "Medium",
      projectName: task.projectName ?? "",
      assigneeValue,
      ccRecipients: (task.ccRecipients ?? []).map(valueFor),
      dueDate: task.dueDate ?? "",
    });
    setShowForm(true);
  };

  const handleSave = () => {
    const payload = {
      title: form.title,
      description: form.description,
      status: form.status,
      priority: form.priority,
      projectName: form.projectName,
      assigneeValue: form.assigneeValue === NONE ? null : form.assigneeValue,
      ccRecipients: selectedAssignee?.type === "freelancer" ? form.ccRecipients : [],
      dueDate: form.dueDate,
    };

    if (editing) {
      update.mutate({ id: editing.id, data: payload } as Parameters<typeof update.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Task updated" }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    } else {
      create.mutate({ data: payload } as Parameters<typeof create.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Task created" }); },
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

  const moveTask = (task: Task, newStatus: string) => {
    update.mutate({ id: task.id, data: { status: newStatus } } as Parameters<typeof update.mutate>[0], {
      onSuccess: () => invalidate(),
    });
  };

  const toggleCc = (value: string) => {
    setForm((prev) => ({
      ...prev,
      ccRecipients: prev.ccRecipients.includes(value)
        ? prev.ccRecipients.filter((v) => v !== value)
        : [...prev.ccRecipients, value],
    }));
  };

  const downloadReport = () => {
    window.location.href = `${apiBase}/reports/system-activity.xlsx`;
  };

  const nextStatus = (s: string) => COLUMNS[(COLUMNS.indexOf(s) + 1) % COLUMNS.length];
  const columnStyles: Record<string, { dot: string; ring: string; bg: string }> = {
    "To Do": { dot: "bg-slate-400", ring: "border-slate-500/30", bg: "bg-slate-500/5" },
    "In Progress": { dot: "bg-primary", ring: "border-primary/40", bg: "bg-primary/5" },
    Done: { dot: "bg-green-400", ring: "border-green-500/30", bg: "bg-green-500/5" },
  };
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const fs = (k: string) => (v: string) => setForm((prev) => ({ ...prev, [k]: v, ...(k === "assigneeValue" && !v.startsWith("freelancer:") ? { ccRecipients: [] } : {}) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('tasks.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadReport} data-testid="button-export-task-report">
            <Download className="h-4 w-4 me-2" /> Export Excel
          </Button>
          <Button onClick={() => openCreate()} data-testid="button-add-task" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 me-2" /> {t('tasks.new')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-4 w-4" /> Total tasks</div>
              <div className="mt-2 text-2xl font-bold">{totalTasks}</div>
            </div>
            <div className="rounded-xl border border-border bg-card/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><MoveRight className="h-4 w-4" /> Open</div>
              <div className="mt-2 text-2xl font-bold text-primary">{openTasks}</div>
            </div>
            <div className="rounded-xl border border-border bg-card/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4" /> High priority</div>
              <div className="mt-2 text-2xl font-bold text-red-400">{highPriorityTasks}</div>
            </div>
            <div className="rounded-xl border border-border bg-card/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Done</div>
              <div className="mt-2 text-2xl font-bold text-green-400">{completedTasks}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col} className={`space-y-3 rounded-2xl border ${columnStyles[col].ring} ${columnStyles[col].bg} p-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${columnStyles[col].dot}`} />
                  <span className="font-semibold text-sm">{col}</span>
                  <span className="text-xs text-muted-foreground bg-card border border-border px-1.5 py-0.5 rounded">{tasksByStatus(col).length}</span>
                </div>
                <button onClick={() => openCreate(col)} className="text-muted-foreground hover:text-foreground transition-colors" data-testid={`button-add-task-${col.replace(/\s+/g, "-").toLowerCase()}`}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 min-h-[240px]">
                {tasksByStatus(col).map((task) => (
                  <div key={task.id} data-testid={`task-card-${task.id}`} className={`rounded-xl border bg-card/95 p-4 space-y-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${task.priority === "High" ? "border-red-500/30" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-snug text-foreground">{task.title}</span>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(task)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => setDeleteId(task.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                    {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                    <div className="flex gap-1 flex-wrap">
                      {task.priority && <Badge variant="outline" className={`text-[10px] px-1 py-0 ${PRIORITY_COLORS[task.priority] ?? ""}`}>{task.priority}</Badge>}
                      {task.projectName && <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">{task.projectName}</Badge>}
                      {(task.assigneeName || task.assignedTo) && <Badge variant="outline" className="text-[10px] px-1 py-0"><Users className="me-1 h-3 w-3" />{task.assigneeName ?? task.assignedTo}</Badge>}
                      {(task.ccRecipients?.length ?? 0) > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">CC {task.ccRecipients!.length}</Badge>}
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      {col !== "Done" && (
                        <button onClick={() => moveTask(task, nextStatus(col))} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5" data-testid={`button-move-${task.id}`}>
                          Move to {nextStatus(col)} <MoveRight className="h-3 w-3" />
                        </button>
                      )}
                      {task.dueDate && <span className="text-[10px] text-muted-foreground">Due: {task.dueDate}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t('tasks.edit') : t('tasks.new')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 sm:py-4">
            <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              Assignment can target either a Team Member or a Freelancer. When a Freelancer is selected, CC recipients appear below. Status changes are saved in tracking history.
            </div>
            <div className="space-y-1"><Label>Title</Label><Input data-testid="input-task-title" value={form.title} onChange={f("title")} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={form.description} onChange={f("description")} rows={3} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={fs("status")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-64">{COLUMNS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={fs("priority")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-64">{["High", "Medium", "Low"].map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>Project</Label><Input value={form.projectName} onChange={f("projectName")} placeholder="Project name" /></div>
              <div className="space-y-1"><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={f("dueDate")} /></div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Assign to Team Member or Freelancer</Label>
                <Select value={form.assigneeValue} onValueChange={fs("assigneeValue")}>
                  <SelectTrigger data-testid="select-task-assignee"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72 w-[var(--radix-select-trigger-width)]">
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-xs uppercase tracking-wide text-muted-foreground">Team Members</SelectLabel>
                      {(assignees.data?.teamMembers ?? []).length === 0 && <SelectItem value="__no_team_members" disabled>No team members</SelectItem>}
                      {(assignees.data?.teamMembers ?? []).map((member) => (
                        <SelectItem key={valueFor(member)} value={valueFor(member)}>
                          <span className="flex flex-col leading-tight">
                            <span>{member.name}</span>
                            <span className="text-[10px] text-muted-foreground">Team Member</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-xs uppercase tracking-wide text-muted-foreground">Freelancers</SelectLabel>
                      {(assignees.data?.freelancers ?? []).length === 0 && <SelectItem value="__no_freelancers" disabled>No freelancers</SelectItem>}
                      {(assignees.data?.freelancers ?? []).map((freelancer) => (
                        <SelectItem key={valueFor(freelancer)} value={valueFor(freelancer)}>
                          <span className="flex flex-col leading-tight">
                            <span>{freelancer.name}</span>
                            <span className="text-[10px] text-muted-foreground">Freelancer</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedAssignee?.type === "freelancer" && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Label>Add in CC for this freelancer task</Label>
                <p className="text-xs text-muted-foreground">CC recipients also receive task notifications.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ccOptions.map((recipient) => (
                    <label key={recipient.value} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox checked={form.ccRecipients.includes(recipient.value)} onCheckedChange={() => toggleCc(recipient.value)} />
                      <span>{recipient.name}</span>
                      <span className="text-xs text-muted-foreground">{recipient.category}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {editing && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Label>Status tracking and updates</Label>
                {activity.isLoading ? <div className="text-xs text-muted-foreground">Loading history...</div> : (activity.data?.length ?? 0) === 0 ? <div className="text-xs text-muted-foreground">No updates yet</div> : (
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {activity.data?.map((item) => (
                      <div key={item.id} className="text-xs">
                        <div className="font-medium">{item.action.replace(/_/g, " ")}</div>
                        <div className="text-muted-foreground">{item.details}</div>
                        <div className="text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
            <Button data-testid="button-save-task" onClick={handleSave} disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('tasks.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{t('common.deleteConfirmDesc')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
