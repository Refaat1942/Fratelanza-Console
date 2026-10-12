import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, Eye, Pencil, Trash2, Check, X, FileText, FileImage, FileSpreadsheet, FileArchive, File as FileIcon } from "lucide-react";

type ClientDocument = { id: number; clientId: number; name: string; fileName: string; mimeType: string; size: number; createdAt: string };

const MAX_BYTES = 19 * 1024 * 1024;
const apiBase = () => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(doc: ClientDocument) {
  const m = doc.mimeType;
  const ext = doc.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("image/")) return FileImage;
  if (["xls", "xlsx", "csv"].includes(ext) || m.includes("sheet")) return FileSpreadsheet;
  if (["zip", "rar", "7z"].includes(ext)) return FileArchive;
  if (m === "application/pdf" || ["doc", "docx", "txt"].includes(ext)) return FileText;
  return FileIcon;
}

/** Client page → documents: upload any file under a chosen name, view, download, rename, delete. */
export function ClientDocuments({ clientId, canWrite = true }: { clientId: number; canWrite?: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const key = ["client-documents", clientId];
  const { data: docs = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ClientDocument[]> => {
      const r = await fetch(`${apiBase()}/clients/${clientId}/documents`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const pick = (f: File | null) => {
    if (f && f.size > MAX_BYTES) {
      toast({ title: t("clientDocs.tooBig", { max: formatSize(MAX_BYTES) }), variant: "destructive" });
      return;
    }
    setFile(f);
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase()}/clients/${clientId}/documents`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-Document-Name": encodeURIComponent(name.trim() || file.name),
        },
        body: file,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? t("common.error"));
      setFile(null); setName("");
      if (fileRef.current) fileRef.current.value = "";
      refresh();
      toast({ title: t("clientDocs.uploaded") });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!renaming || !renaming.name.trim()) return;
    const r = await fetch(`${apiBase()}/clients/${clientId}/documents/${renaming.id}`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renaming.name }),
    });
    if (r.ok) { setRenaming(null); refresh(); } else toast({ title: t("common.error"), variant: "destructive" });
  };

  const remove = async (doc: ClientDocument) => {
    if (!window.confirm(t("clientDocs.confirmDelete", { name: doc.name }))) return;
    const r = await fetch(`${apiBase()}/clients/${clientId}/documents/${doc.id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) refresh(); else toast({ title: t("common.error"), variant: "destructive" });
  };

  const fileUrl = (doc: ClientDocument, download = false) => `${apiBase()}/clients/${clientId}/documents/${doc.id}/file${download ? "?download=1" : ""}`;

  return (
    <div className="space-y-2" data-testid="client-documents">
      <div className="text-sm font-semibold">{t("clientDocs.title")}</div>
      {canWrite && (
        <div className="rounded border border-dashed border-border p-3 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} data-testid="input-document-file" />
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 me-1" />{t("clientDocs.chooseFile")}</Button>
            <span className="text-xs text-muted-foreground truncate max-w-[16rem]">{file ? `${file.name} (${formatSize(file.size)})` : t("clientDocs.anyType", { max: formatSize(MAX_BYTES) })}</span>
          </div>
          {file && (
            <div className="flex flex-wrap gap-2">
              <Input className="flex-1 min-w-[12rem] h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("clientDocs.namePlaceholder")} data-testid="input-document-name" />
              <Button size="sm" className="h-9" onClick={upload} disabled={busy} data-testid="button-upload-document">{busy ? t("common.saving") : t("clientDocs.upload")}</Button>
            </div>
          )}
        </div>
      )}
      {isLoading ? null : docs.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t("clientDocs.none")}</div>
      ) : (
        <div className="space-y-1.5">
          {docs.map((doc) => {
            const Icon = iconFor(doc);
            const editingThis = renaming?.id === doc.id;
            return (
              <div key={doc.id} className="flex flex-wrap items-center gap-2 rounded border border-border p-2 text-sm" data-testid={`document-${doc.id}`}>
                <Icon className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  {editingThis ? (
                    <div className="flex gap-1">
                      <Input className="h-8" autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: doc.id, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveName()} />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveName}><Check className="h-4 w-4 text-green-500" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRenaming(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <>
                      <div className="font-medium truncate">{doc.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{doc.fileName} · {formatSize(doc.size)} · {doc.createdAt.slice(0, 10)}</div>
                    </>
                  )}
                </div>
                {!editingThis && (
                  <div className="flex gap-1">
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8" title={t("clientDocs.view")}><a href={fileUrl(doc)} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" /></a></Button>
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8" title={t("clientDocs.download")}><a href={fileUrl(doc, true)}><Download className="h-4 w-4" /></a></Button>
                    {canWrite && <>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title={t("clientDocs.rename")} onClick={() => setRenaming({ id: doc.id, name: doc.name })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title={t("common.delete")} onClick={() => remove(doc)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
