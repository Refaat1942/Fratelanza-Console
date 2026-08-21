import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PaginatedOutlineEditor } from "@/components/paginated-outline-editor";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Upload, Download, FileText, Link2, Check } from "lucide-react";
import { extractOutlineFromFile } from "@/lib/outline-file-parser";

export type ClientQuoteSummary = {
  id: number;
  clientName: string;
  projectName?: string | null;
  price: number;
  date?: string | null;
  language?: string | null;
  hasOutline?: boolean;
  hasReport?: boolean;
};

type Props = {
  projectId?: number | null;
  clientName: string;
  technicalOutline: string;
  generatedReport: string;
  quoteId?: number | null;
  outlineFileName?: string | null;
  hasOutlineFile?: boolean;
  onOutlineChange: (v: string) => void;
  onReportChange: (v: string) => void;
  onQuoteLink: (quote: ClientQuoteSummary, importPrice: boolean) => void;
  onFileUploaded?: (fileName: string) => void;
};

function apiBase() {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
}

export function ProjectDocumentsPanel({
  projectId,
  clientName,
  technicalOutline,
  generatedReport,
  quoteId,
  outlineFileName,
  hasOutlineFile,
  onOutlineChange,
  onReportChange,
  onQuoteLink,
  onFileUploaded,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [quotes, setQuotes] = useState<ClientQuoteSummary[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(outlineFileName ?? null);

  useEffect(() => {
    setUploadName(outlineFileName ?? null);
  }, [outlineFileName]);

  useEffect(() => {
    const name = clientName.trim();
    if (!name) {
      setQuotes([]);
      return;
    }
    setLoadingQuotes(true);
    const url = projectId
      ? `${apiBase()}/projects/${projectId}/quotes`
      : `${apiBase()}/projects/quotes-by-client?clientName=${encodeURIComponent(name)}`;
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ClientQuoteSummary[]) => setQuotes(Array.isArray(rows) ? rows : []))
      .catch(() => setQuotes([]))
      .finally(() => setLoadingQuotes(false));
  }, [clientName, projectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      if (projectId) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(`${apiBase()}/projects/${projectId}/outline`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Upload failed");
        onOutlineChange(data.project?.technicalOutline ?? "");
        setUploadName(file.name);
        onFileUploaded?.(file.name);
        toast({ title: t("projects.outlineUploaded") });
      } else {
        const parsed = await extractOutlineFromFile(file);
        onOutlineChange(parsed.text);
        setUploadName(file.name);
        toast({ title: t("projects.outlineParsed") });
      }
    } catch (err) {
      toast({ title: t("projects.outlineUploadFailed"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadFile = async () => {
    if (!projectId || !hasOutlineFile) return;
    try {
      const r = await fetch(`${apiBase()}/projects/${projectId}/outline-file`, { credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Download failed");
      const link = document.createElement("a");
      link.href = `data:application/octet-stream;base64,${data.dataBase64}`;
      link.download = data.fileName ?? "outline";
      link.click();
    } catch (err) {
      toast({ title: t("projects.outlineDownloadFailed"), description: (err as Error).message, variant: "destructive" });
    }
  };

  const linkQuote = async (quote: ClientQuoteSummary) => {
    if (projectId) {
      try {
        const r = await fetch(`${apiBase()}/projects/${projectId}/link-quote`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId: quote.id, importPrice: true }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Link failed");
        onQuoteLink(quote, true);
        if (data.project?.technicalOutline) onOutlineChange(data.project.technicalOutline);
        if (data.project?.generatedReport) onReportChange(data.project.generatedReport);
        toast({ title: t("projects.quoteLinked") });
      } catch (err) {
        toast({ title: t("projects.quoteLinkFailed"), description: (err as Error).message, variant: "destructive" });
      }
    } else {
      try {
        const r = await fetch(`${apiBase()}/quotes/${quote.id}`, { credentials: "include" });
        const full = await r.json();
        if (!r.ok) throw new Error(full.error ?? "Quote load failed");
        onQuoteLink(quote, true);
        if (full.technicalOutline) onOutlineChange(full.technicalOutline);
        if (full.generatedReport) onReportChange(full.generatedReport);
        toast({ title: t("projects.quoteSelected") });
      } catch (err) {
        toast({ title: t("projects.quoteLinkFailed"), description: (err as Error).message, variant: "destructive" });
      }
    }
  };

  return (
    <div className="md:col-span-2 space-y-4 border border-border rounded-md p-3 bg-card/40">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" />
          {t("projects.documentsSection")}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.md,.csv"
            className="hidden"
            onChange={handleUpload}
            data-testid="input-project-outline"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={parsing}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            {parsing ? t("projects.outlineUploading") : t("projects.uploadOutline")}
          </Button>
          {hasOutlineFile && projectId && (
            <Button type="button" size="sm" variant="outline" onClick={downloadFile}>
              <Download className="h-3.5 w-3.5 mr-1" /> {t("projects.downloadOutline")}
            </Button>
          )}
        </div>
      </div>

      {uploadName && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          {uploadName}
          {!projectId && <span className="text-amber-500">({t("projects.saveToStoreFile")})</span>}
        </div>
      )}

      <PaginatedOutlineEditor
        label={t("projects.technicalOutline")}
        value={technicalOutline}
        onChange={onOutlineChange}
        placeholder={t("projects.outlinePlaceholder")}
        testId="textarea-project-outline"
      />

      <div className="space-y-1">
        <Label className="text-sm">{t("projects.customerReport")}</Label>
        <textarea
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={generatedReport}
          onChange={(e) => onReportChange(e.target.value)}
          placeholder={t("projects.reportPlaceholder")}
          data-testid="textarea-project-report"
        />
      </div>

      <div className="space-y-2 pt-2 border-t border-border/50">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="h-4 w-4 text-primary" />
          {t("projects.clientQuotes")}
          {quoteId && <Badge variant="outline" className="text-green-400 border-green-500/40 text-[10px]"><Check className="h-3 w-3 mr-1" /> #{quoteId}</Badge>}
        </div>
        {!clientName.trim() ? (
          <p className="text-xs text-muted-foreground">{t("projects.selectClientForQuotes")}</p>
        ) : loadingQuotes ? (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        ) : quotes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("projects.noClientQuotes")}</p>
        ) : (
          <div className="rounded-md border border-border overflow-hidden max-h-36 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-card/80 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left">{t("quotes.projectName")}</th>
                  <th className="px-2 py-1.5 text-left">{t("quotes.price")}</th>
                  <th className="px-2 py-1.5 text-left">{t("quotes.date")}</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className={`border-t border-border/40 ${quoteId === q.id ? "bg-primary/5" : ""}`}>
                    <td className="px-2 py-1.5 font-medium max-w-[140px] truncate">{q.projectName ?? "—"}</td>
                    <td className="px-2 py-1.5 text-primary"><PrivacyWrapper value={q.price} /></td>
                    <td className="px-2 py-1.5 text-muted-foreground">{q.date ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={quoteId === q.id ? "secondary" : "outline"}
                        className="h-7 text-[10px]"
                        onClick={() => void linkQuote(q)}
                        data-testid={`button-link-quote-${q.id}`}
                      >
                        {quoteId === q.id ? t("projects.linked") : t("projects.linkQuote")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
