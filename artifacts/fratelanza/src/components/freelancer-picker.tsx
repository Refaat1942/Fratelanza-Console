import { useMemo, useState } from "react";
import { useListFreelancers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Star, ChevronDown, Search, ExternalLink, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type FreelancerRow = {
  code: string;
  name: string;
  spec?: string | null;
  rating: number;
  skills?: string[] | null;
  portfolioUrl?: string | null;
  hasCv?: boolean;
  bio?: string | null;
};

type Props = {
  value: string;
  onChange: (name: string) => void;
  exclude?: string[];
  preferredSpec?: string;
  placeholder?: string;
  className?: string;
  testId?: string;
};

function scoreFreelancer(fr: FreelancerRow, preferredSpec?: string, query?: string): number {
  let score = Number(fr.rating) || 0;
  if (preferredSpec && fr.spec?.toLowerCase().includes(preferredSpec.toLowerCase())) score += 3;
  if (fr.portfolioUrl) score += 0.5;
  if (fr.hasCv) score += 0.5;
  if (query) {
    const q = query.toLowerCase();
    if (fr.name.toLowerCase().includes(q)) score += 2;
    if (fr.spec?.toLowerCase().includes(q)) score += 1.5;
    if (fr.skills?.some((s) => s.toLowerCase().includes(q))) score += 1;
  }
  return score;
}

export function FreelancerPicker({
  value,
  onChange,
  exclude = [],
  preferredSpec,
  placeholder = "Select freelancer",
  className,
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: freelancers = [] } = useListFreelancers();

  const ranked = useMemo(() => {
    const list = (freelancers as FreelancerRow[]).filter(
      (f) => !exclude.includes(f.name) || f.name === value,
    );
    return list
      .map((f) => ({ ...f, score: scoreFreelancer(f, preferredSpec, search) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }, [freelancers, exclude, preferredSpec, search, value]);

  const selected = (freelancers as FreelancerRow[]).find((f) => f.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", className)}
          data-testid={testId}
        >
          <span className="truncate text-left flex-1">
            {selected ? (
              <span className="flex items-center gap-2">
                {selected.name}
                {selected.spec && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">— {selected.spec}</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, skill, specialization..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid={testId ? `${testId}-search` : undefined}
            />
          </div>
          {preferredSpec && (
            <div className="flex items-center gap-1 mt-2 text-[10px] text-primary">
              <Sparkles className="h-3 w-3" /> Smart match for: {preferredSpec}
            </div>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {ranked.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No freelancers found</div>
          ) : (
            ranked.map((fr) => (
              <button
                key={fr.code}
                type="button"
                className={cn(
                  "w-full text-left rounded-md px-2 py-2 hover:bg-accent transition-colors",
                  value === fr.name && "bg-primary/10",
                )}
                onClick={() => {
                  onChange(fr.name);
                  setOpen(false);
                  setSearch("");
                }}
                data-testid={testId ? `${testId}-option-${fr.code}` : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{fr.name}</div>
                    {fr.spec && (
                      <div className="text-xs text-muted-foreground truncate">{fr.spec}</div>
                    )}
                    {fr.skills && fr.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {fr.skills.slice(0, 4).map((s) => (
                          <Badge key={s} variant="outline" className="text-[9px] px-1 py-0">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                      <Star className="h-3 w-3 fill-yellow-400" /> {Number(fr.rating).toFixed(1)}
                    </span>
                    <div className="flex gap-1">
                      {fr.hasCv && <span title="CV on file"><FileText className="h-3 w-3 text-muted-foreground" /></span>}
                      {fr.portfolioUrl && (
                        <span title="Portfolio"><ExternalLink className="h-3 w-3 text-primary" /></span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
