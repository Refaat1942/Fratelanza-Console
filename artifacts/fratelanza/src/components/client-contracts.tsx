import { useTranslation } from "react-i18next";
import { useListContracts, useListProjects, type Contract } from "@workspace/api-client-react";
import { useBranding } from "@/lib/branding-context";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileSignature, Printer } from "lucide-react";
import { buildClientContractHtml, defaultClientContract, printContractHtml, type ClientContractData } from "@/lib/contract-document";

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Client contracts saved in the Contracts tab for this client (matched by the client's name). */
export function ClientContracts({ clientName }: { clientName?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const branding = useBranding();
  const { data: contracts = [] } = useListContracts();
  const { data: projects = [] } = useListProjects();
  const key = norm(clientName);
  // Also contracts linked to one of this client's projects
  const projectIds = new Set((projects as { id: number; clientName?: string | null }[]).filter((p) => key && norm(p.clientName) === key).map((p) => p.id));
  const mine = key
    ? (contracts as Contract[]).filter((c) => c.type === "client"
      && (norm(c.partyName) === key || norm((c.data as Record<string, unknown>)?.clientName) === key || (c.projectId != null && projectIds.has(c.projectId))))
    : [];

  const print = (c: Contract) => {
    const d = { ...defaultClientContract(), ...(c.data as Partial<ClientContractData>) } as ClientContractData;
    if (!printContractHtml(buildClientContractHtml(d, { logoDataUrl: branding.logoDataUrl }))) {
      toast({ title: t("contracts.popupBlocked"), variant: "destructive" });
    }
  };

  return (
    <div data-testid="client-contracts">
      <div className="text-sm font-semibold mb-2">{t("clients.contractsSection")}</div>
      {mine.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t("clients.noContracts")}</div>
      ) : (
        <div className="space-y-2">
          {mine.map((c) => {
            const d = c.data as Partial<ClientContractData>;
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm" data-testid={`client-contract-${c.id}`}>
                <div className="min-w-0">
                  <div className="font-medium flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="bg-violet-600/15 text-violet-400 border-violet-600/30"><FileSignature className="h-3 w-3 me-1" />{t("clients.contract")}</Badge>
                    {d.projectName || d.subject || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">{d.contractDate || c.createdAt.slice(0, 10)}{c.amount > 0 && <> · <PrivacyWrapper value={c.amount} /></>}</div>
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={() => print(c)} data-testid={`button-print-contract-${c.id}`}>
                  <Printer className="h-3.5 w-3.5 sm:me-1" /><span className="hidden sm:inline">{t("clients.printContract")}</span>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
