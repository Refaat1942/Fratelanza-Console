import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTasks, getListTasksQueryKey, useCreateTask, useUpdateTask, useDeleteTask, useListProjects } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, MoveRight } from "lucide-react";

type Task = { id: number; title: string; description?: string | null; status: string; priority?: string | null; projectName?: string | null; assignedTo?: string | null; dueDate?: string | null; createdAt: string; };

const COLUMNS = ["Todo", "In Progress", "Done"];

const PRIORITY_COLORS: Record<string, string> = {
  High: "bg-red-500/20 text-red-400 border-red-500/30",
  Medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Low: "bg-green-500/20 text-green-400 border-green-500/30",
};

const emptyForm = { title: "", description: "", status: "Todo", priority: "Medium", projectName: "", assignedTo: "", dueDate: "" };

export default function Tasks() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: tasks = [], isLoading } = useListTasks();
  const { data: projects = [] } = useListProjects();
  const create = useCreateTask();
  const update = useUpdateTask();
  const del = useDeleteTask();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const tasksByStatus = (status: string) => (tasks as Task[]).filter((t) => t.status === status);

  const openCreate = (status = "Todo") => { setForm({ ...emptyForm, status }); setEditing(null); setShowForm(true); };
  const openEdit = (t: Task) => { setEditing(t); setForm({ title: t.title, description: t.description ?? "", status: t.status, priority: t.priority ?? "Medium", projectName: t.projectName ?? "", assignedTo: t.assignedTo ?? "", dueDate: t.dueDate ?? "" }); setShowForm(true); };

  const handleSave = () => {
    if (editing) {
      update.mutate({ id: editing.id, data: form } as Parameters<typeof update.mutate>[0], {
        onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Task updated" }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    } else {
      create.mutate({ data: form } as Parameters<typeof create.mutate>[0], {
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

  const nextStatus = (s: string) => COLUMNS[(COLUMNS.indexOf(s) + 1) % COLUMNS.length];

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  const fs = (k: string) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Task Board</h1>
        <Button onClick={() => openCreate()} data-testid="button-add-task" className="bg-primary text-black hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> New Task
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map((col) => (
            <div key={col} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${col === "Todo" ? "bg-muted-foreground" : col === "In Progress" ? "bg-primary" : "bg-green-400"}`} />
                  <span className="font-semibold text-sm">{col}</span>
                  <span className="text-xs text-muted-foreground bg-card border border-border px-1.5 py-0.5 rounded">{tasksByStatus(col).length}</span>
                </div>
                <button onClick={() => openCreate(col)} className="text-muted-foreground hover:text-foreground transition-colors" data-testid={`button-add-task-${col.replace(" ", "-").toLowerCase()}`}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2 min-h-[200px]">
                {tasksByStatus(col).map((task) => (
                  <div key={task.id} data-testid={`task-card-${task.id}`} className="rounded-lg border border-border bg-card p-3 space-y-2 hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">{task.title}</span>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(task)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => setDeleteId(task.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                    {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex gap-1 flex-wrap">
                        {task.priority && <Badge variant="outline" className={`text-[10px] px-1 py-0 ${PRIORITY_COLORS[task.priority] ?? ""}`}>{task.priority}</Badge>}
                        {task.projectName && <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">{task.projectName}</Badge>}
                      </div>
                      {col !== "Done" && (
                        <button onClick={() => moveTask(task, nextStatus(col))} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5" data-testid={`button-move-${task.id}`}>
                          <MoveRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {(task.assignedTo || task.dueDate) && (
                      <div className="flex gap-3 text-[10px] text-muted-foreground">
                        {task.assignedTo && <span>{task.assignedTo}</span>}
                        {task.dueDate && <span>Due: {task.dueDate}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Task" : "New Task"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1"><Label>Title</Label><Input data-testid="input-task-title" value={form.title} onChange={f("title")} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={form.description} onChange={f("description")} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={fs("status")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COLUMNS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={fs("priority")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["High", "Medium", "Low"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>Project</Label><Input value={form.projectName} onChange={f("projectName")} placeholder="Project name" /></div>
              <div className="space-y-1"><Label>Assigned To</Label><Input value={form.assignedTo} onChange={f("assignedTo")} /></div>
              <div className="space-y-1"><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={f("dueDate")} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button data-testid="button-save-task" onClick={handleSave} disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Task?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
