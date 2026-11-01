import { COMPANY, amountToArabicWords, esc, formatDateAr, formatMoney, resolveMarks, shell, signatureMark, type ContractHtmlOptions, type MarksChoice } from "@/lib/contract-document";
import { paymentMethodLabel } from "@/lib/payment-methods";

/** One payment received from a client, with the project's position after it. */
export type ReceiptData = {
  paymentId: number;
  amount: number;
  paymentMethod: string;
  /** yyyy-mm-dd */
  paidAt: string;
  notes?: string | null;
  clientName: string;
  projectName: string;
  /** Project value; 0 = unknown (the balance lines are left out) */
  projectTotal: number;
  /** Everything the client has paid up to and including this payment */
  paidToDate: number;
  /** Company stamp / manager's signature on this receipt (missing = Settings default) */
  marks?: MarksChoice;
};

/** Receipt serial printed on the document, e.g. RC-2026-00012 (from the payment's id). */
export function receiptNo(d: Pick<ReceiptData, "paymentId" | "paidAt">): string {
  const year = /^\d{4}/.exec(d.paidAt)?.[0] ?? String(new Date().getFullYear());
  return `RC-${year}-${String(d.paymentId).padStart(5, "0")}`;
}

/**
 * Everything paid up to and including one payment (payments in date order,
 * same-day payments in the order they were logged).
 */
export function paidUpTo(payments: { id: number; amount: number; paidAt?: string | null; createdAt: string }[], paymentId: number): number {
  const key = (p: { id: number; paidAt?: string | null; createdAt: string }) => `${p.paidAt ?? p.createdAt.slice(0, 10)}#${String(p.id).padStart(10, "0")}`;
  const target = payments.find((p) => p.id === paymentId);
  if (!target) return 0;
  return payments.filter((p) => key(p) <= key(target)).reduce((s, p) => s + Number(p.amount), 0);
}

const CSS = `
  .rc-amount, table.rc th, .rc-no { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rc-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 4px 0 12px; }
  .rc-head h1 { margin: 0; text-align: start; }
  .rc-no { border: 2px solid #0a192f; border-radius: 6px; padding: 2px 12px; font-size: 11pt; line-height: 1.7; text-align: center; }
  .rc-no b { color: #b91c1c; letter-spacing: .5px; }
  .rc-amount { display: flex; align-items: center; justify-content: space-between; gap: 14px; background: #0a192f; color: #fff; border-radius: 8px; padding: 10px 16px; margin: 10px 0; }
  .rc-amount .lbl { font-size: 11pt; opacity: .85; }
  .rc-amount .val { font-size: 20pt; font-weight: 700; color: #7dd3fc; white-space: nowrap; }
  table.rc { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 12pt; }
  table.rc th { width: 30%; text-align: start; background: #f3f4f6; color: #0a192f; font-weight: 600; }
  table.rc th, table.rc td { border: 1px solid #d1d5db; padding: 6px 10px; line-height: 1.7; vertical-align: top; }
  table.rc td b { color: #0a192f; }
  table.rc tr.bal td { font-weight: 700; }
  .rc-words { color: #0a192f; font-weight: 700; }
  .rc-note { font-size: 10pt; color: #4b5563; margin-top: 10px; }
  .sign.rc-sign div { line-height: 2.4; }
  .sign div.rc-stamp { margin-top: 6px; border: 0; padding: 0; line-height: 1; } .rc-stamp img.mk-stamp { width: 170px; }
  .stamp { height: 70px; border: 1px dashed #9ca3af; border-radius: 50%; width: 110px; margin-top: 4px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 9pt; }
`;

/** سند استلام نقدية: printed for the client after any payment. */
export function buildReceiptHtml(d: ReceiptData, opts: ContractHtmlOptions = {}): string {
  const marks = resolveMarks(opts.assets, "receipts", d.marks);
  const amount = Number(d.amount) || 0;
  const remaining = Math.max(0, (Number(d.projectTotal) || 0) - (Number(d.paidToDate) || 0));
  const money = (n: number) => `${formatMoney(n)} ج.م`;
  const balance = d.projectTotal > 0 ? `
      <tr><th>قيمة المشروع</th><td>${money(d.projectTotal)}</td></tr>
      <tr><th>إجمالي المدفوع حتى تاريخه</th><td>${money(d.paidToDate)}</td></tr>
      <tr class="bal"><th>المتبقي</th><td>${remaining > 0 ? money(remaining) : "لا يوجد – تم سداد كامل قيمة المشروع"}</td></tr>` : "";
  const body = `
  <div class="rc-head">
    <h1>سند استلام نقدية</h1>
    <div class="rc-no">رقم السند: <b>${esc(receiptNo(d))}</b><br>التاريخ: ${esc(formatDateAr(d.paidAt))}</div>
  </div>
  <p>استلمت ${esc(COMPANY.name)} من السادة / <b>${esc(d.clientName || "................................")}</b> المبلغ الموضح أدناه، وذلك ${esc(d.projectName ? `دفعةً من قيمة مشروع «${d.projectName}»` : "دفعةً من المستحقات")}.</p>
  <div class="rc-amount"><span class="lbl">المبلغ المستلم</span><span class="val">${money(amount)}</span></div>
  <table class="rc"><tbody>
    <tr><th>المبلغ كتابةً</th><td class="rc-words">فقط ${esc(amountToArabicWords(amount))} جنيهاً مصرياً لا غير</td></tr>
    <tr><th>طريقة الدفع</th><td>${esc(paymentMethodLabel(d.paymentMethod, "ar"))}</td></tr>
    ${d.notes?.trim() ? `<tr><th>ملاحظات</th><td>${esc(d.notes)}</td></tr>` : ""}
    ${balance}
  </tbody></table>
  <div class="sign rc-sign">
    <div><b>المستلم (عن الشركة)</b>الاسم: ${marks.signature ? esc(COMPANY.manager) : "................................"}<br>التوقيع: ${signatureMark(marks.signature, "................................")}${marks.stamp ? `<div class="rc-stamp"><img class="mk-stamp" src="${marks.stamp}" alt=""></div>` : `<div class="stamp">ختم الشركة</div>`}</div>
    <div><b>المسدِّد (العميل)</b>الاسم: ${esc(d.clientName) || "................................"}<br>التوقيع: ................................</div>
  </div>
  <p class="rc-note">هذا السند إثبات لاستلام المبلغ المذكور فقط، ولا يُعد مخالصة نهائية إلا بسداد كامل قيمة المشروع. ${d.paymentMethod !== "cash" ? "في حالة الشيك أو التحويل يُعتبر السداد تامّاً بعد تحصيل المبلغ فعلياً." : ""}</p>`;
  return shell(receiptFileName(d), body, opts, CSS);
}

/** A file name without characters Windows / macOS refuse. */
function safeName(parts: (string | null | undefined)[]): string {
  return parts.map((x) => String(x ?? "").replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).join(" - ").slice(0, 150);
}

/** Saved / downloaded name of a receipt: its type, the client, the project and its number. */
export function receiptFileName(d: Pick<ReceiptData, "clientName" | "projectName" | "paymentId" | "paidAt">): string {
  return safeName(["سند استلام نقدية", d.clientName, d.projectName, receiptNo(d)]);
}

/** One payment given to a freelancer, with their position on the project after it. */
export type VoucherData = {
  paymentId: number;
  amount: number;
  paymentMethod: string;
  /** yyyy-mm-dd */
  paidAt: string;
  notes?: string | null;
  freelancerName: string;
  projectName: string;
  /** The freelancer's agreed amount on the project; 0 = unknown (balance lines left out) */
  agreedTotal: number;
  /** Everything paid to this freelancer up to and including this payment */
  paidToDate: number;
  marks?: MarksChoice;
};

/** Voucher serial, e.g. PV-2026-00007 (from the payment's id). */
export function voucherNo(d: Pick<VoucherData, "paymentId" | "paidAt">): string {
  const year = /^\d{4}/.exec(d.paidAt)?.[0] ?? String(new Date().getFullYear());
  return `PV-${year}-${String(d.paymentId).padStart(5, "0")}`;
}

/** Saved / downloaded name of a voucher: its type, the freelancer, the project and its number. */
export function voucherFileName(d: Pick<VoucherData, "freelancerName" | "projectName" | "paymentId" | "paidAt">): string {
  return safeName(["سند صرف نقدية", d.freelancerName, d.projectName, voucherNo(d)]);
}

/** سند صرف نقدية: money given to a freelancer, signed by the freelancer on receipt. */
export function buildVoucherHtml(d: VoucherData, opts: ContractHtmlOptions = {}): string {
  const marks = resolveMarks(opts.assets, "receipts", d.marks);
  const amount = Number(d.amount) || 0;
  const remaining = Math.max(0, (Number(d.agreedTotal) || 0) - (Number(d.paidToDate) || 0));
  const money = (n: number) => `${formatMoney(n)} ج.م`;
  const forWhat = d.projectName ? `دفعة من مستحقاته عن تنفيذ أعمال مشروع «${d.projectName}»` : "دفعة من مستحقاته";
  const balance = d.agreedTotal > 0 ? `
      <tr><th>إجمالي المستحق عن المشروع</th><td>${money(d.agreedTotal)}</td></tr>
      <tr><th>إجمالي المصروف حتى تاريخه</th><td>${money(d.paidToDate)}</td></tr>
      <tr class="bal"><th>المتبقي له</th><td>${remaining > 0 ? money(remaining) : "لا يوجد – تم صرف كامل المستحقات"}</td></tr>` : "";
  const body = `
  <div class="rc-head">
    <h1>سند صرف نقدية</h1>
    <div class="rc-no">رقم السند: <b>${esc(voucherNo(d))}</b><br>التاريخ: ${esc(formatDateAr(d.paidAt))}</div>
  </div>
  <p>صرفت ${esc(COMPANY.name)} إلى السيد / <b>${esc(d.freelancerName || "................................")}</b> المبلغ الموضح أدناه، وذلك ${esc(forWhat)}.</p>
  <div class="rc-amount"><span class="lbl">المبلغ المصروف</span><span class="val">${money(amount)}</span></div>
  <table class="rc"><tbody>
    <tr><th>المبلغ كتابةً</th><td class="rc-words">فقط ${esc(amountToArabicWords(amount))} جنيهاً مصرياً لا غير</td></tr>
    <tr><th>طريقة الصرف</th><td>${esc(paymentMethodLabel(d.paymentMethod, "ar"))}</td></tr>
    ${d.notes?.trim() ? `<tr><th>ملاحظات</th><td>${esc(d.notes)}</td></tr>` : ""}
    ${balance}
  </tbody></table>
  <div class="sign rc-sign">
    <div><b>المُسلِّم (عن الشركة)</b>الاسم: ${marks.signature ? esc(COMPANY.manager) : "................................"}<br>التوقيع: ${signatureMark(marks.signature, "................................")}${marks.stamp ? `<div class="rc-stamp"><img class="mk-stamp" src="${marks.stamp}" alt=""></div>` : `<div class="stamp">ختم الشركة</div>`}</div>
    <div><b>المستلم (منفذ العمل)</b>الاسم: ${esc(d.freelancerName) || "................................"}<br>الرقم القومي: ................................<br>التوقيع: ................................</div>
  </div>
  <p class="rc-note">يقر المستلم باستلام المبلغ المذكور أعلاه كاملاً، وأنه دفعة من مستحقاته عن المشروع المذكور ولا يُعد مخالصة نهائية إلا بصرف كامل المستحقات.</p>`;
  return shell(voucherFileName(d), body, opts, CSS);
}

/**
 * Print a document from a hidden frame: works after an async save, where a
 * new window would be blocked as a pop-up. "Save as PDF" suggests the page's
 * title as the file name, so the title is the document's name while printing.
 */
export function printHtmlInFrame(html: string, fileName?: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    const w = frame.contentWindow!;
    const ready = (doc as Document & { fonts?: FontFaceSet }).fonts?.ready ?? Promise.resolve();
    ready.then(() => setTimeout(() => {
      const pageTitle = document.title;
      if (fileName) document.title = fileName;
      const restore = () => { document.title = pageTitle; };
      w.addEventListener("afterprint", restore, { once: true });
      w.focus();
      w.print();
      setTimeout(restore, 1000);
      setTimeout(() => frame.remove(), 60_000);
    }, 250));
  };
  if (doc.readyState === "complete") go(); else frame.onload = go;
}
