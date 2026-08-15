import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { parseOutlinePages, joinOutlinePages, cleanOutlineText } from "@/lib/outline-pages";
import { useTranslation } from "react-i18next";

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  testId?: string;
};

export function PaginatedOutlineEditor({ label, value, onChange, rows = 8, placeholder, testId }: Props) {
  const { t } = useTranslation();
  const pages = useMemo(() => parseOutlinePages(value), [value]);
  const [pageIndex, setPageIndex] = useState(0);
  const safeIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const current = pages[safeIndex] ?? "";

  const updatePages = (next: string[]) => {
    onChange(joinOutlinePages(next));
    if (pageIndex >= next.length) setPageIndex(Math.max(0, next.length - 1));
  };

  const updateCurrentPage = (text: string) => {
    const next = [...pages];
    next[safeIndex] = cleanOutlineText(text);
    updatePages(next);
  };

  const addPage = () => {
    updatePages([...pages, ""]);
    setPageIndex(pages.length);
  };

  const removePage = () => {
    if (pages.length <= 1) {
      onChange("");
      return;
    }
    const next = pages.filter((_, i) => i !== safeIndex);
    updatePages(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={safeIndex <= 0} onClick={() => setPageIndex((i) => i - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[80px] text-center">
            {t("quotes.pageOf", { current: safeIndex + 1, total: pages.length })}
          </span>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={safeIndex >= pages.length - 1} onClick={() => setPageIndex((i) => i + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={addPage}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {t("quotes.addPage")}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={removePage}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Textarea
        value={current}
        onChange={(e) => updateCurrentPage(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        data-testid={testId}
        className="min-h-[140px] text-sm"
      />
      <p className="text-xs text-muted-foreground">{t("quotes.pagesHint")}</p>
    </div>
  );
}
