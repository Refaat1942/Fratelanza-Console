type QuoteForPdf = {
  clientName: string;
  projectName?: string | null;
  price: number;
  language?: string | null;
  date?: string | null;
  paymentTerms?: string | null;
  milestones?: string | null;
  notes?: string | null;
};

function fmtEGP(n: number) {
  return `EGP ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escMultiline(s: string | null | undefined): string {
  return esc(s).replace(/\n/g, "<br>");
}

export function printQuote(q: QuoteForPdf) {
  const isArabic = q.language === "Arabic";
  const dir = isArabic ? "rtl" : "ltr";
  const lang = isArabic ? "ar" : "en";

  const labels = isArabic
    ? {
        title: "عرض سعر",
        client: "العميل",
        date: "التاريخ",
        items: "البنود",
        description: "الوصف",
        amount: "المبلغ",
        total: "الإجمالي",
        paymentTerms: "شروط الدفع",
        milestones: "المراحل",
        notes: "ملاحظات",
        company: "فراتي لانزا",
        thanks: "شكراً لتعاملكم معنا",
      }
    : {
        title: "Sales Quote",
        client: "Client",
        date: "Date",
        items: "Items",
        description: "Description",
        amount: "Amount",
        total: "Total",
        paymentTerms: "Payment Terms",
        milestones: "Milestones",
        notes: "Notes",
        company: "Fratelanza",
        thanks: "Thank you for your business",
      };

  const items = (q.projectName ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  const alignAmount = isArabic ? "left" : "right";

  const itemsHtml = items.length
    ? items.map((it) => `<tr><td>${esc(it)}</td><td style="text-align:${alignAmount}">—</td></tr>`).join("")
    : `<tr><td>${esc(q.projectName ?? "")}</td><td style="text-align:${alignAmount}">${esc(fmtEGP(q.price))}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${esc(labels.title)} — ${esc(q.clientName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ${isArabic ? "'Tahoma','Amiri',sans-serif" : "'Inter',sans-serif"}; padding: 32px; color: #0a192f; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #00BFFF; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { color: #00BFFF; margin: 0; font-size: 28px; }
  .company { font-size: 20px; font-weight: bold; }
  .meta { color: #555; font-size: 14px; margin-top: 8px; }
  .meta strong { color: #0a192f; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: ${isArabic ? "right" : "left"}; }
  th { background: #f5f7fa; color: #0a192f; font-size: 13px; text-transform: uppercase; }
  .total-row td { border-top: 2px solid #0a192f; border-bottom: none; font-weight: bold; font-size: 16px; }
  .total-row .price { color: #00BFFF; }
  .section { margin: 16px 0; }
  .section h3 { font-size: 14px; color: #0a192f; margin: 0 0 6px 0; text-transform: uppercase; }
  .section p { margin: 0; color: #333; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; text-align: center; color: #888; font-size: 12px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${esc(labels.title)}</h1>
      <div class="meta"><strong>${esc(labels.client)}:</strong> ${esc(q.clientName)}</div>
      ${q.date ? `<div class="meta"><strong>${esc(labels.date)}:</strong> ${esc(q.date)}</div>` : ""}
    </div>
    <div class="company">${esc(labels.company)}</div>
  </header>

  <div class="section">
    <h3>${esc(labels.items)}</h3>
    <table>
      <thead><tr><th>${esc(labels.description)}</th><th style="width:160px;text-align:${alignAmount}">${esc(labels.amount)}</th></tr></thead>
      <tbody>
        ${itemsHtml}
        <tr class="total-row"><td>${esc(labels.total)}</td><td class="price" style="text-align:${alignAmount}">${esc(fmtEGP(q.price))}</td></tr>
      </tbody>
    </table>
  </div>

  ${q.paymentTerms ? `<div class="section"><h3>${esc(labels.paymentTerms)}</h3><p>${escMultiline(q.paymentTerms)}</p></div>` : ""}
  ${q.milestones ? `<div class="section"><h3>${esc(labels.milestones)}</h3><p>${escMultiline(q.milestones)}</p></div>` : ""}
  ${q.notes ? `<div class="section"><h3>${esc(labels.notes)}</h3><p>${escMultiline(q.notes)}</p></div>` : ""}

  <footer>${esc(labels.thanks)}</footer>

  <script>window.onload = function () { setTimeout(function () { window.print(); }, 100); };</script>
</body>
</html>`;

  const w = window.open("", "_blank", "noopener=no,noreferrer=no");
  if (!w) return;
  try { (w as Window & { opener: Window | null }).opener = null; } catch {}
  w.document.open();
  w.document.write(html);
  w.document.close();
}
