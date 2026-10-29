import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchOption = { value: string; label: string; hint?: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  /** Options always listed first, in this order (e.g. "New customer", "No project") */
  pinned?: SearchOption[];
  placeholder?: string;
  className?: string;
  testId?: string;
};

const collator = new Intl.Collator(["ar", "en"], { numeric: true, sensitivity: "base" });
const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();

/**
 * A dropdown for long lists (clients, projects): every option is reachable by scrolling,
 * a search box filters by name, and options are sorted naturally (2 before 10).
 */
export function SearchSelect({ value, onChange, options, pinned = [], placeholder, className, testId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const sorted = useMemo(() => [...options].sort((a, b) => collator.compare(a.label, b.label)), [options]);
  const shown = useMemo(() => {
    const q = norm(search);
    if (!q) return [...pinned, ...sorted];
    return sorted.filter((o) => norm(o.label).includes(q) || (o.hint && norm(o.hint).includes(q)));
  }, [search, pinned, sorted]);

  const selected = [...pinned, ...options].find((o) => o.value === value);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open}
          className={cn("w-full justify-between font-normal h-9 px-3", className)} data-testid={testId}>
          <span className={cn("truncate text-start flex-1", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder ?? t("common.select")}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[16rem] max-w-[calc(100vw-2rem)]" align="start"
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}>
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")}
              className="ps-8 h-8 text-sm" data-testid={testId ? `${testId}-search` : undefined}
              onKeyDown={(e) => { if (e.key === "Enter" && shown.length) { e.preventDefault(); pick(shown[0]!.value); } }} />
          </div>
        </div>
        {/* Scroll inside the list (wheel and touch), capped to the space on screen */}
        <div role="listbox" className="max-h-[min(18rem,calc(var(--radix-popover-content-available-height)-4rem))] overflow-y-auto overscroll-contain p-1"
          onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} data-testid={testId ? `${testId}-list` : undefined}>
          {shown.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("common.noResults")}</div>
          ) : shown.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} onClick={() => pick(o.value)}
              className={cn("w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-start hover:bg-accent hover:text-accent-foreground", o.value === value && "bg-primary/10")}
              data-testid={testId ? `${testId}-option-${o.value}` : undefined}>
              <span className="flex-1 min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
