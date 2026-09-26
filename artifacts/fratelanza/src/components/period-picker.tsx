import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CalendarRange } from "lucide-react";

export type PeriodPreset = "all" | "thisMonth" | "lastMonth" | "last3Months" | "thisQuarter" | "thisYear" | "lastYear" | "custom";
export type Period = { preset: PeriodPreset; startDate: string; endDate: string };

const STORAGE_KEY = "fratelanza.period";
const PRESETS: PeriodPreset[] = ["all", "thisMonth", "lastMonth", "last3Months", "thisQuarter", "thisYear", "lastYear", "custom"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Date range (YYYY-MM-DD, local time) for a preset; empty strings mean "no limit". */
export function presetRange(preset: PeriodPreset, now = new Date()): { startDate: string; endDate: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "thisMonth": return { startDate: iso(new Date(y, m, 1)), endDate: iso(new Date(y, m + 1, 0)) };
    case "lastMonth": return { startDate: iso(new Date(y, m - 1, 1)), endDate: iso(new Date(y, m, 0)) };
    case "last3Months": return { startDate: iso(new Date(y, m - 2, 1)), endDate: iso(new Date(y, m + 1, 0)) };
    case "thisQuarter": {
      const q = Math.floor(m / 3) * 3;
      return { startDate: iso(new Date(y, q, 1)), endDate: iso(new Date(y, q + 3, 0)) };
    }
    case "thisYear": return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    case "lastYear": return { startDate: `${y - 1}-01-01`, endDate: `${y - 1}-12-31` };
    default: return { startDate: "", endDate: "" };
  }
}

function loadPeriod(): Period {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Period | null;
    if (saved && PRESETS.includes(saved.preset)) {
      // Relative presets are recomputed so "this month" stays current
      return saved.preset === "custom" ? saved : { preset: saved.preset, ...presetRange(saved.preset) };
    }
  } catch { /* storage unavailable */ }
  return { preset: "all", startDate: "", endDate: "" };
}

/** Selected period, remembered in this browser and shared by Dashboard and Finance. */
export function usePeriod() {
  const [period, setPeriod] = useState<Period>(loadPeriod);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(period)); } catch { /* ignore */ }
  }, [period]);
  const params = { startDate: period.startDate || undefined, endDate: period.endDate || undefined };
  return { period, setPeriod, params };
}

export function usePeriodLabel(period: Period) {
  const { t } = useTranslation();
  if (period.preset === "all" || (!period.startDate && !period.endDate)) return t("period.all");
  return `${period.startDate || "…"} → ${period.endDate || "…"}`;
}

export function PeriodPicker({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="period-picker">
      <CalendarRange className="h-4 w-4 text-muted-foreground" />
      <Select
        value={period.preset}
        onValueChange={(v) => {
          const preset = v as PeriodPreset;
          onChange(preset === "custom" ? { ...period, preset } : { preset, ...presetRange(preset) });
        }}
      >
        <SelectTrigger className="w-44" data-testid="select-period"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => <SelectItem key={p} value={p}>{t(`period.${p}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      {period.preset === "custom" && (
        <>
          <Input type="date" className="w-36" aria-label={t("period.from")} value={period.startDate} onChange={(e) => onChange({ ...period, startDate: e.target.value })} data-testid="input-start-date" />
          <span className="text-muted-foreground text-sm">→</span>
          <Input type="date" className="w-36" aria-label={t("period.to")} value={period.endDate} onChange={(e) => onChange({ ...period, endDate: e.target.value })} data-testid="input-end-date" />
        </>
      )}
    </div>
  );
}
