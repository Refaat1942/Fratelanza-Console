import { resolveQuoteLineItems, type QuoteLineItem } from "./quote-line-items";

export type { QuoteLineItem };

export type QuoteForPdf = {
  clientName: string;
  projectName?: string | null;
  lineItems?: QuoteLineItem[] | null;
  price: number;
  language?: string | null;
  date?: string | null;
  paymentTerms?: string | null;
  milestones?: string | null;
  notes?: string | null;
};

export type QuotePdfOptions = {
  logoDataUrl?: string | null;
  brandName?: string;
  taxId?: string;
};

const TAX_ID = "779-103-211";
const ACCENT = "#00BFFF";
const NAVY = "#0a192f";
const MUTED = "#646464";

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

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuoteDate(date?: string | null): string {
  if (!date) return "";
  const d = new Date(date.includes("T") ? date : `${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function totalFromItems(items: QuoteLineItem[], fallback: number): number {
  const sum = items.reduce((s, i) => s + i.price, 0);
  return sum > 0 ? sum : fallback;
}

export function printQuote(q: QuoteForPdf, opts: QuotePdfOptions = {}) {
  const isArabic = q.language === "Arabic";
  const dir = isArabic ? "rtl" : "ltr";
  const lang = isArabic ? "ar" : "en";
  const taxId = opts.taxId ?? TAX_ID;
  const brandName = opts.brandName ?? "Fratelanza";
  const companyDisplay = isArabic ? "فراتيلانزا" : brandName;
  const items = resolveQuoteLineItems(q);
  const total = totalFromItems(items, q.price);
  const quoteDate = formatQuoteDate(q.date);

  const labels = isArabic
    ? {
        title: "عرض سعر رسمي",
        taxReg: `رقم التسجيل الضريبي: ${taxId}`,
        date: `التاريخ: ${quoteDate}`,
        client: `مقدم إلى السيد/الشركة: ${q.clientName}`,
        priceHeader: "السعر (جنيه مصري)",
        descHeader: "وصف الخدمة / المشروع",
        total: "الإجمــــالـــي",
        paymentTerms: "آليات وشروط الدفع:",
        milestones: "مراحل التسليم والجدول الزمني:",
        notes: "ملاحظات إضافية:",
        thanks: "شكراً لثقتكم في فراتيلانزا!",
        validity: "عرض السعر ساري لمدة 14 يوم من تاريخ الإصدار.",
        priceSuffix: "ج.م",
      }
    : {
        title: "Official Sales Quotation",
        taxReg: `Tax Reg No: ${taxId}`,
        date: `Date: ${quoteDate}`,
        client: `Prepared For: ${q.clientName}`,
        priceHeader: " Price (EGP)",
        descHeader: " Service / Project Description",
        total: " TOTAL",
        paymentTerms: "Payment Terms:",
        milestones: "Project Milestones & Delivery:",
        notes: "Additional Notes:",
        thanks: "Thank you for trusting Fratelanza!",
        validity: "This quotation is valid for 14 days from the date of issuance.",
        priceSuffix: "EGP",
      };

  const logoHtml = opts.logoDataUrl
    ? `<img src="${esc(opts.logoDataUrl)}" alt="" class="logo" />`
    : "";

  const itemRows = items
    .map((item) => {
      const priceCell = `${formatNum(item.price)} ${labels.priceSuffix}`;
      if (isArabic) {
        return `<tr>
          <td class="price-col">${esc(priceCell)}</td>
          <td class="desc-col">${esc(item.desc)}</td>
        </tr>`;
      }
      return `<tr>
        <td class="desc-col">${esc(item.desc)}</td>
        <td class="price-col">${esc(priceCell)}</td>
      </tr>`;
    })
    .join("");

  const totalPriceCell = `${formatNum(total)} ${labels.priceSuffix}`;
  const totalRow = isArabic
    ? `<tr class="total-row">
        <td class="price-col">${esc(totalPriceCell)}</td>
        <td class="desc-col">${esc(labels.total)}</td>
      </tr>`
    : `<tr class="total-row">
        <td class="desc-col">${esc(labels.total)}</td>
        <td class="price-col">${esc(totalPriceCell)}</td>
      </tr>`;

  const headerRow = isArabic
    ? `<tr>
        <th class="price-col">${esc(labels.priceHeader)}</th>
        <th class="desc-col">${esc(labels.descHeader)}</th>
      </tr>`
    : `<tr>
        <th class="desc-col">${esc(labels.descHeader)}</th>
        <th class="price-col">${esc(labels.priceHeader)}</th>
      </tr>`;

  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${esc(labels.title)} — ${esc(q.clientName)}</title>
<style>
  @page { margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: ${isArabic ? "'Segoe UI','Tahoma','Arial',sans-serif" : "'Helvetica Neue','Helvetica','Arial',sans-serif"};
    margin: 0;
    padding: 16px 20px;
    color: ${NAVY};
    background: #fff;
    font-size: 16px;
    line-height: 1.4;
  }
  .header {
    position: relative;
    min-height: 72px;
    margin-bottom: 8px;
  }
  .logo {
    position: absolute;
    top: 0;
    ${isArabic ? "left: 0;" : "right: 0;"}
    width: 45mm;
    max-height: 18mm;
    object-fit: contain;
  }
  .company {
    font-size: 32px;
    font-weight: 700;
    color: ${NAVY};
    margin: 0 0 4px 0;
    text-align: ${isArabic ? "right" : "left"};
    ${isArabic ? "padding-left: 50mm;" : "padding-right: 50mm;"}
  }
  .tax-reg {
    font-size: 12px;
    color: ${MUTED};
    margin: 0 0 12px 0;
    text-align: ${isArabic ? "right" : "left"};
    ${isArabic ? "padding-left: 50mm;" : "padding-right: 50mm;"}
  }
  .divider {
    border: none;
    border-top: 2px solid ${ACCENT};
    margin: 0 0 16px 0;
  }
  .doc-title {
    font-size: ${isArabic ? "18px" : "16px"};
    font-style: ${isArabic ? "normal" : "italic"};
    color: ${MUTED};
    margin: 0 0 12px 0;
    text-align: ${isArabic ? "right" : "left"};
  }
  .meta {
    font-size: 14px;
    margin: 0 0 6px 0;
    text-align: ${isArabic ? "right" : "left"};
  }
  .meta strong { font-weight: 700; color: #000; }
  table.items {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 20px 0 8px 0;
    table-layout: fixed;
    border: 1px solid #d0d0d0;
    border-radius: 10px;
    overflow: hidden;
  }
  table.items th,
  table.items td {
    border: none;
    border-bottom: 1px solid #d0d0d0;
    padding: 10px 12px;
    vertical-align: middle;
    word-wrap: break-word;
  }
  table.items th:not(:last-child),
  table.items td:not(:last-child) {
    border-right: 1px solid #d0d0d0;
  }
  table.items tbody tr:last-child td {
    border-bottom: none;
  }
  table.items th {
    background: ${ACCENT};
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    text-align: center;
  }
  table.items td.desc-col {
    text-align: ${isArabic ? "center" : "left"};
    width: 68%;
  }
  table.items td.price-col {
    text-align: center;
    width: 32%;
    white-space: nowrap;
  }
  table.items tr.total-row td {
    background: #f0f8ff;
    font-weight: 700;
    font-size: 16px;
  }
  table.items tr.total-row td.desc-col {
    text-align: ${isArabic ? "center" : "right"};
  }
  .section { margin: 14px 0 0 0; text-align: ${isArabic ? "right" : "left"}; }
  .section h3 {
    margin: 0 0 6px 0;
    font-size: ${isArabic ? "16px" : "14px"};
    font-weight: 700;
  }
  .section.payment h3 { color: ${ACCENT}; }
  .section.milestones h3 { color: #28a745; }
  .section.notes h3 { color: #ffc107; }
  .section p {
    margin: 0;
    font-size: ${isArabic ? "14px" : "12px"};
    color: #000;
    line-height: 1.6;
  }
  .footer {
    margin-top: 28px;
    font-size: 12px;
    font-style: italic;
    color: ${MUTED};
    text-align: ${isArabic ? "right" : "left"};
  }
  .footer p { margin: 0 0 6px 0; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <h1 class="company">${esc(companyDisplay)}</h1>
    <p class="tax-reg">${esc(labels.taxReg)}</p>
  </div>
  <hr class="divider" />
  <p class="doc-title">${esc(labels.title)}</p>
  <p class="meta">${isArabic ? esc(labels.date) : `<strong>Date:</strong> ${esc(quoteDate)}`}</p>
  <p class="meta">${isArabic ? esc(labels.client) : `<strong>Prepared For:</strong> ${esc(q.clientName)}`}</p>

  <table class="items">
    <thead>${headerRow}</thead>
    <tbody>
      ${itemRows}
      ${totalRow}
    </tbody>
  </table>

  ${q.paymentTerms ? `<div class="section payment"><h3>${esc(labels.paymentTerms)}</h3><p>${escMultiline(q.paymentTerms)}</p></div>` : ""}
  ${q.milestones ? `<div class="section milestones"><h3>${esc(labels.milestones)}</h3><p>${escMultiline(q.milestones)}</p></div>` : ""}
  ${q.notes ? `<div class="section notes"><h3>${esc(labels.notes)}</h3><p>${escMultiline(q.notes)}</p></div>` : ""}

  <div class="footer">
    <p>${esc(labels.thanks)}</p>
    <p>${esc(labels.validity)}</p>
  </div>

  <script>window.onload = function () { setTimeout(function () { window.print(); }, 150); };</script>
</body>
</html>`;

  const w = window.open("", "_blank", "noopener=no,noreferrer=no");
  if (!w) return;
  try { (w as Window & { opener: Window | null }).opener = null; } catch {}
  w.document.open();
  w.document.write(html);
  w.document.close();
}
