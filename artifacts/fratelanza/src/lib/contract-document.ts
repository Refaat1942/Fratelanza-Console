import defaultLogo from "@/assets/fratelanza-logo.png?inline";

/* ───────────────────────── Types & defaults ───────────────────────── */

export type ContractType = "client" | "freelancer";

export type ClientStage = { label: string; pct: number };
export type FreelancerStage = { label: string; pct: number; due: string; deliverable: string };

export type ClientContractData = {
  contractDate: string;
  clientType: "individual" | "company";
  clientName: string;
  nationality: string;
  clientAddress: string;
  representativeName: string;
  idNumber: string;
  projectName: string;
  subject: string;
  durationDays: string;
  totalPrice: number;
  stages: ClientStage[];
  paymentNotes: string;
  hourlyRate: string;
  supportMonths: string;
  court: string;
  signatoryName: string;
  signatoryTitle: string;
  /** Show a "paid so far" column in the payments table */
  showPaid: boolean;
  paidSoFar: number;
};

export type FreelancerContractData = {
  contractDate: string;
  freelancerName: string;
  freelancerNationalId: string;
  originalContractDate: string;
  originalContractNumber: string;
  projectName: string;
  amount: number;
  stages: FreelancerStage[];
  payWithinDays: string;
  showPaid: boolean;
  paidSoFar: number;
};

export const today = () => new Date().toISOString().slice(0, 10);

export function defaultClientContract(): ClientContractData {
  return {
    contractDate: today(),
    clientType: "company",
    clientName: "",
    nationality: "مصرية",
    clientAddress: "",
    representativeName: "",
    idNumber: "",
    projectName: "",
    subject: "",
    durationDays: "",
    totalPrice: 0,
    stages: [
      { label: "الدفعة الأولى (مقدم التعاقد)", pct: 30 },
      { label: "الدفعة الثانية (أثناء التنفيذ)", pct: 30 },
      { label: "الدفعة الثالثة (أثناء التنفيذ)", pct: 30 },
      { label: "الدفعة الرابعة والأخيرة (عند التسليم النهائي)", pct: 10 },
    ],
    paymentNotes: "",
    hourlyRate: "",
    supportMonths: "",
    court: "",
    signatoryName: "",
    signatoryTitle: "",
    showPaid: false,
    paidSoFar: 0,
  };
}

export function defaultFreelancerContract(): FreelancerContractData {
  return {
    contractDate: today(),
    freelancerName: "",
    freelancerNationalId: "",
    originalContractDate: "",
    originalContractNumber: "",
    projectName: "",
    amount: 0,
    stages: [
      { label: "الأولى", pct: 20, due: "عند توقيع العقد الأصلي وهذا الملحق وبدء التنفيذ", deliverable: "تجهيز بيئة العمل والمستودع والبنية الأساسية وبدء المرحلة الأولى." },
      { label: "الثانية", pct: 30, due: "بعد تسليم وقبول المرحلتين الأولى والثانية", deliverable: "" },
      { label: "الثالثة", pct: 30, due: "بعد استكمال مراحل التوسع", deliverable: "" },
      { label: "الرابعة", pct: 20, due: "بعد الاختبار والتكامل والتسليم النهائي", deliverable: "اجتياز اختبارات القبول، إصلاح الملاحظات الجوهرية، وتسليم السورس كود وملفات المشروع وبيانات الوصول النهائية." },
    ],
    payWithinDays: "",
    showPaid: false,
    paidSoFar: 0,
  };
}

/* ───────────────────────── Calculations ───────────────────────── */

export type StageRow<S> = S & { amount: number; paid: number; remaining: number };

/**
 * Amount per payment stage. Amounts are rounded to whole pounds and the last
 * stage takes the rounding difference, so the stages always add up to the total.
 * `paidSoFar` is applied to the stages in order (first payment first).
 */
export function computeStages<S extends { pct: number }>(total: number, stages: S[], paidSoFar = 0) {
  const pctSum = Math.round(stages.reduce((s, x) => s + (Number(x.pct) || 0), 0) * 100) / 100;
  let allocated = 0;
  let paidLeft = Math.max(0, paidSoFar);
  const rows: StageRow<S>[] = stages.map((st, i) => {
    const isLast = i === stages.length - 1;
    const amount = isLast && pctSum === 100 ? Math.round((total - allocated) * 100) / 100 : Math.round((total * (Number(st.pct) || 0)) / 100);
    allocated += amount;
    const paid = Math.min(amount, paidLeft);
    paidLeft -= paid;
    return { ...st, amount, paid, remaining: amount - paid };
  });
  return {
    rows,
    pctSum,
    valid: pctSum === 100,
    totalAllocated: rows.reduce((s, r) => s + r.amount, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    remaining: rows.reduce((s, r) => s + r.remaining, 0),
  };
}

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة",
  "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]!);
  if (r) {
    if (r < 20) parts.push(ONES[r]!);
    else {
      const u = r % 10;
      const t = Math.floor(r / 10);
      parts.push(u ? `${ONES[u]} و${TENS[t]}` : TENS[t]!);
    }
  }
  return parts.join(" و");
}

function scaled(n: number, one: string, two: string, plural: string, singular: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const r = n % 100;
  return `${below1000(n)} ${r >= 3 && r <= 10 ? plural : singular}`;
}

/** 150000 → "مائة وخمسون ألف" (integer pounds; piasters appended when present) */
export function amountToArabicWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  const piasters = Math.round((Math.abs(value) - n) * 100);
  if (n === 0 && piasters === 0) return "صفر";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(scaled(millions, "مليون", "مليونان", "ملايين", "مليون"));
  if (thousands) parts.push(scaled(thousands, "ألف", "ألفان", "آلاف", "ألف"));
  if (rest) parts.push(below1000(rest));
  let words = parts.join(" و");
  if (piasters) words += `${words ? " و" : ""}${below1000(piasters)} قرشاً`;
  return words;
}

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function arabicDayName(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : DAYS[d.getDay()]!;
}

/** "2026-09-27" → "27 / 09 / 2026" */
export function formatDateAr(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  return m ? `${m[3]} / ${m[2]} / ${m[1]}` : "";
}

export function formatMoney(n: number): string {
  return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/* ───────────────────────── HTML document ───────────────────────── */

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A filled blank, or a dotted line to fill in by hand when left empty. */
function fill(v: unknown, dots = "........................"): string {
  const s = String(v ?? "").trim();
  return s ? `<span class="fill">${esc(s)}</span>` : `<span class="blank">${dots}</span>`;
}

function dateFill(date: string): string {
  return formatDateAr(date) ? fill(formatDateAr(date)) : `<span class="blank">.... / .... / ........</span>`;
}

const COMPANY = {
  name: "شركة فراتيلانزا للتدريب والبرمجة وحلول الذكاء الاصطناعي",
  line1: "شركة فراتيلانزا للتدريب والبرمجة",
  line2: "وحلول الذكاء الاصطناعي",
  registry: "55529",
  taxId: "779103211",
  address: "261 الحي الرابع – المحور المركزي – 6 أكتوبر – الجيزة",
  manager: "أحمد محمد رفعت السيد",
  managerId: "28611068800735",
};

const COMPANY_FOOTER = `${COMPANY.name} – سجل تجاري ${COMPANY.registry} – بطاقة ضريبية ${COMPANY.taxId}`;

export type ContractHtmlOptions = { logoDataUrl?: string | null; number?: string; autoPrint?: boolean };

function shell(title: string, body: string, opts: ContractHtmlOptions): string {
  const logo = opts.logoDataUrl || defaultLogo;
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${esc(title)}${opts.number ? ` – ${esc(opts.number)}` : ""}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 15mm 16mm 18mm 16mm;
    @bottom-right { content: "${COMPANY_FOOTER}"; font-family: 'Noto Naskh Arabic', Tahoma, sans-serif; font-size: 8pt; color: #6b7280; vertical-align: top; padding-top: 3mm; }
    @bottom-left { content: "صفحة " counter(page) " من " counter(pages); font-family: 'Noto Naskh Arabic', Tahoma, sans-serif; font-size: 8.5pt; color: #6b7280; vertical-align: top; padding-top: 3mm; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; }
  body { font-family: 'Noto Naskh Arabic', 'Traditional Arabic', 'Arabic Typesetting', Tahoma, sans-serif; color: #111827; font-size: 12.5pt; line-height: 1.95; }
  .page { max-width: 178mm; margin: 0 auto; padding: 6mm 0; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #0a192f; padding-bottom: 8px; margin-bottom: 4px; }
  header img { width: 74px; height: 74px; object-fit: contain; border-radius: 50%; }
  header .co { flex: 1; line-height: 1.5; }
  header .co b { display: block; font-size: 14pt; color: #0a192f; }
  header .co span { font-size: 10pt; color: #374151; }
  header .ref { text-align: left; font-size: 9.5pt; color: #374151; line-height: 1.6; direction: rtl; }
  header .ref b { color: #0a192f; }
  .accent { height: 3px; background: linear-gradient(90deg, #00bfff, #0a192f); margin-bottom: 14px; }
  h1 { text-align: center; font-size: 17pt; margin: 6px 0 12px; color: #0a192f; }
  h2 { font-size: 13pt; margin: 14px 0 4px; color: #0a192f; border-right: 4px solid #00bfff; padding-right: 8px; page-break-after: avoid; }
  p { margin: 4px 0; text-align: justify; }
  ol { margin: 4px 0; padding-right: 22px; }
  ol li { text-align: justify; margin: 2px 0; }
  .fill { font-weight: 700; color: #0a192f; border-bottom: 1px dotted #6b7280; padding: 0 3px; }
  .blank { color: #6b7280; letter-spacing: 1px; }
  table.pay { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11pt; }
  table.pay thead { display: table-header-group; }
  table.pay tr { page-break-inside: avoid; break-inside: avoid; }
  .refbox { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 12px; margin: 0 0 10px; font-size: 11pt; background: #f9fafb; }
  table.pay th, table.pay td { border: 1px solid #9ca3af; padding: 5px 8px; vertical-align: top; }
  table.pay th { background: #0a192f; color: #fff; font-weight: 600; line-height: 1.5; }
  table.pay td { line-height: 1.6; }
  table.pay td.num { text-align: center; white-space: nowrap; }
  table.pay tr.total td { background: #f3f4f6; font-weight: 700; }
  .paid { color: #047857; } .due { color: #b45309; }
  .warn { border: 2px solid #dc2626; color: #dc2626; padding: 6px 10px; margin: 8px 0; font-weight: 700; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; page-break-inside: avoid; }
  .sign div { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 14px; line-height: 2.3; }
  .sign b { display: block; color: #0a192f; border-bottom: 1px solid #e5e7eb; margin-bottom: 4px; }
  footer { display: none; }
  @media screen { body { background: #e5e7eb; } .page { background: #fff; padding: 14mm 16mm; margin: 12px auto; box-shadow: 0 2px 10px rgba(0,0,0,.15); max-width: 210mm; } footer { display: block; text-align: center; font-size: 8.5pt; color: #6b7280; max-width: 210mm; margin: 0 auto 12px; } }
</style></head>
<body>
<div class="page">
  <header>
    <img src="${logo}" alt="Fratelanza">
    <div class="co"><b>${COMPANY.line1}</b><span>${COMPANY.line2}</span></div>
    <div class="ref">${opts.number ? `رقم العقد: <b>${esc(opts.number)}</b><br>` : ""}سجل تجاري: ${COMPANY.registry}<br>بطاقة ضريبية: ${COMPANY.taxId}</div>
  </header>
  <div class="accent"></div>
  ${body}
</div>
<footer>${COMPANY.name} – سجل تجاري ${COMPANY.registry} – بطاقة ضريبية ${COMPANY.taxId} – ${COMPANY.address}</footer>
${opts.autoPrint ? `<script>window.onload=function(){(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print();},200);});};</script>` : ""}
</body></html>`;
}

export function buildClientContractHtml(d: ClientContractData, opts: ContractHtmlOptions = {}): string {
  const calc = computeStages(d.totalPrice, d.stages, d.showPaid ? d.paidSoFar : 0);
  const company = d.clientType === "company";
  const secondParty = company
    ? `ثانياً: الشركة / ${fill(d.clientName, ".....................................................")}، الجنسية ${fill(d.nationality, ".....................")}، الكائن مقرها في ${fill(d.clientAddress, ".....................................................")}، ويمثلها السيد / ${fill(d.representativeName, ".....................................................")} ويحمل بطاقة رقم قومي / سجل تجاري ${fill(d.idNumber, "................................................")} (الطرف الثاني - العميل).`
    : `ثانياً: السيد / ${fill(d.clientName, ".....................................................")}، الجنسية ${fill(d.nationality, ".....................")}، المقيم في ${fill(d.clientAddress, ".....................................................")}، ويحمل بطاقة رقم قومي ${fill(d.idNumber, "................................................")} (الطرف الثاني - العميل).`;

  const paidCols = d.showPaid;
  const rows = calc.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.pct}%</td><td class="num">${formatMoney(r.amount)} ج.م</td>${paidCols ? `<td class="num paid">${formatMoney(r.paid)}</td><td class="num due">${formatMoney(r.remaining)}</td>` : ""}</tr>`).join("");
  const total = d.totalPrice;

  const body = `
  <h1>عقد اتفاق على تنفيذ وتطوير مشروع تقني</h1>
  <p>إنه في يوم ${fill(arabicDayName(d.contractDate), "............")} الموافق ${dateFill(d.contractDate)} م</p>
  <p>تحرر هذا العقد بين كل من:</p>
  <p>أولاً: السادة / ${COMPANY.name}، سجل تجاري رقم ${COMPANY.registry} بطاقة ضريبية رقم ${COMPANY.taxId} الكائنة ${COMPANY.address}، ويمثلها في التوقيع على هذا العقد السيد / ${COMPANY.manager} بصفته المدير المسئول ويحمل بطاقة رقم قومي ${COMPANY.managerId} (الطرف الأول - الشركة المنفذة).</p>
  <p>${secondParty}</p>
  <p>بعد أن أقر الطرفان بأهليتهما القانونية للتعاقد والتصرف، اتفقا على البنود التالية:</p>

  <h2>البند الأول: التمهيد</h2>
  <p>يعتبر التمهيد والمواصفات الفنية المرسلة في عرض السعر جزءاً لا يتجزأ من هذا العقد ومكملاً لجميع بنوده. حيث أن الطرف الأول شركة متخصصة في حلول تكنولوجيا المعلومات والاتصالات والتحول الرقمي وتصميم البرمجيات وتطبيقات الهواتف، وحيث أبدى الطرف الثاني رغبته في إسناد مهمة تنفيذ وتطوير مشروع (${fill(d.projectName)}) للطرف الأول، فقد تلاقت إرادة الطرفين على تنفيذ هذا المشروع وفقاً للشروط الموضحة أدناه.</p>

  <h2>البند الثاني: موضوع العقد</h2>
  <p>يوافق الطرف الأول على القيام ${fill(d.subject, "..............................................................")} لصالح الطرف الثاني، وذلك وفقاً للمتطلبات والمواصفات الفنية المحددة والموقع عليها من كلا الطرفين في "ملحق المواصفات الفنية" المرفق بهذا العقد.</p>

  <h2>البند الثالث: مدة التنفيذ والتسليم</h2>
  <p>يلتزم الطرف الأول بتسليم المشروع المطلوب في مدة أقصاها (${fill(d.durationDays, "........")}) يوم عمل، تبدأ من تاريخ توقيع هذا العقد واستلام الدفعة المقدمة، وتوفير الطرف الثاني لكافة البيانات والمحتوى اللازم للبدء في التنفيذ.</p>

  <h2>البند الرابع: التكلفة الإجمالية وطريقة الدفع</h2>
  <p>اتفق الطرفان على أن التكلفة الإجمالية لتنفيذ المشروع هي ${total ? fill(`${formatMoney(total)} جنيهاً مصرياً`) : fill("", "............")} (فقط ${total ? fill(`${amountToArabicWords(total)} جنيهاً مصرياً`) : fill("", "....................................")} لا غير)، ويتم سدادها على الدفعات التالية:</p>
  ${calc.valid ? "" : `<div class="warn">تنبيه: مجموع نسب الدفعات = ${calc.pctSum}% ويجب أن يساوي 100%.</div>`}
  <table class="pay">
    <thead><tr><th>المرحلة</th><th>النسبة</th><th>المبلغ</th>${paidCols ? "<th>المسدد حتى تاريخه</th><th>المتبقي</th>" : ""}</tr></thead>
    <tbody>${rows}<tr class="total"><td>الإجمالي</td><td class="num">${calc.pctSum}%</td><td class="num">${formatMoney(calc.totalAllocated)} ج.م</td>${paidCols ? `<td class="num paid">${formatMoney(calc.paid)}</td><td class="num due">${formatMoney(calc.remaining)}</td>` : ""}</tr></tbody>
  </table>
  <p>ملاحظات أخرى للدفع: ${fill(d.paymentNotes, "................................................................................................")}</p>

  <h2>البند الخامس: التعديلات والتحديثات الإضافية</h2>
  <ol>
    <li>أثناء فترة التنفيذ: يحق للطرف الثاني إبداء ملاحظات وتعديلات في حدود المتفق عليه في "عرض السعر". أما في حال طلب الطرف الثاني إضافة خصائص أو مهام جديدة لم يتم النص عليها مسبقاً، فيلتزم الطرف الأول بتقديم "عرض سعر إضافي" يحدد تكلفة هذه الإضافات والمدة الزمنية اللازمة لتنفيذها، ولا يتم البدء فيها إلا بموافقة كتابية من الطرف الثاني.</li>
    <li>بعد التسليم النهائي (التحديثات والتطوير): أي طلبات لتحديث المشروع أو إضافة ميزات جديدة بعد التوقيع على محضر الاستلام النهائي، تُعد تعاقداً جديداً، وتُحسب تكلفتها بناءً على حجم العمل المطلوب، إما بنظام التكلفة المقطوعة (عرض سعر لكل تحديث) أو بنظام الساعات البرمجية بتكلفة قدرها (${fill(d.hourlyRate, "........")} جنيهاً مصرياً / للساعة البرمجية).</li>
  </ol>

  <h2>البند السادس: الدعم الفني والصيانة</h2>
  <p>يقدم الطرف الأول دعماً فنياً مجانياً للمشروع لمدة (${fill(d.supportMonths, "........")}) شهراً تبدأ من تاريخ التسليم النهائي، ويقتصر هذا الدعم على إصلاح أي أخطاء برمجية (Bugs) قد تظهر في النظام المتفق عليه. ولا يشمل الدعم المجاني إضافة أي ميزات جديدة أو إصلاح الأعطال الناتجة عن سوء الاستخدام.</p>

  <h2>البند السابع: السرية وحقوق الملكية</h2>
  <p>يقر الطرف الأول بالحفاظ على سرية بيانات الطرف الثاني. وتؤول حقوق استخدام المشروع للطرف الثاني فور سداده لكامل المستحقات المالية المذكورة في البند الرابع، على أن يحتفظ الطرف الأول بحقوق ملكية الأكواد المصدرية الأساسية والأدوات البرمجية المستخدمة في التطوير ما لم يُتفق على غير ذلك.</p>

  <h2>البند الثامن: فسخ العقد والشرط الجزائي</h2>
  <p>في حالة إخلال أي من الطرفين بالتزاماته، يحق للطرف الآخر توجيه إنذار بضرورة تدارك الإخلال خلال (15) يوماً، وإذا لم يتم ذلك، يُعد العقد مفسوخاً، مع احتفاظ الطرف المضرور بحقه في المطالبة بالتعويض المناسب عن الأضرار التي لحقت به.</p>

  <h2>البند التاسع: الاختصاص القضائي</h2>
  <p>تختص محاكم (${fill(d.court)}) بالنظر في أي نزاع (لا قدر الله) قد ينشأ بصدد تفسير أو تنفيذ بنود هذا العقد.</p>

  <h2>البند العاشر: نسخ العقد</h2>
  <p>تحرر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها عند اللزوم.</p>

  <h2>البند الحادي عشر: أحكام تنظيمية مكملة</h2>
  <ol>
    <li>مرجعية العرض الفني والمدة: تُعد جميع البنود المتفق عليها والخاصة بالتنفيذ والتسليم والدعم الفني والمراحل والتسليمات الزمنية وفقاً لما هو موضح في العرض الفني الخاص بالمشروع والتطبيق والموقع عليه من الطرفين، ويُعد العرض الفني وملحق المواصفات الفنية جزءاً مكملاً ومفسراً لهذا العقد.</li>
    <li>بدء مدة التنفيذ: تبدأ مدة التنفيذ الخاصة بالطرف الثاني حسب ما ورد في البند الثالث وبما هو موضح في العرض الفني الخاص بالمشروع والتطبيق، على أن يلتزم الطرف الثاني بتوفير كافة البيانات والمحتوى والاعتمادات والملاحظات المطلوبة في المواعيد المطلوبة.</li>
    <li>الدفعات: يلتزم الطرف الثاني بسداد الدفعات المستحقة وفقاً للعرض الفني والتسليمات والمراحل المرتبطة بالمشروع، ويترتب على ذلك تمديد الجدول الزمني للتنفيذ والتسليم بقدر مدة التعليق، دون أن يعد ذلك إخلالاً أو تأخيراً من الطرف الأول.</li>
    <li>المراجعة والاستلام والاعتماد: يتم فحص وتسليم كل مرحلة أو نسخة تجريبية أو التسليم النهائي وفقاً للمتطلبات والمواصفات الواردة في العرض الفني وملحق المواصفات الفنية، وعلى الطرف الثاني إبداء الملاحظات خلال المدة المتفق عليها.</li>
    <li>التمييز بين الأخطاء البرمجية والإضافات الجديدة: يُقصد بالخطأ البرمجي (Bug) وجود خلل فني في تنفيذ وظيفة أو مطلب منصوص عليه ومتفق عليه في العرض الفني أو ملحق المواصفات الفنية، أما إضافة أو تعديل وظيفة غير متفق عليها فتُعد إضافة جديدة وتخضع للبند الخامس من هذا العقد.</li>
    <li>الإلغاء من جانب الطرف الثاني: في حال طلب الطرف الثاني إلغاء المشروع أو العمل بعد بدء التنفيذ، دون وجود إخلال من الطرف الأول، تتم تسوية قيمة الأعمال المنفذة فعلياً حتى تاريخ الإلغاء، بالإضافة إلى أي التزامات أو تكاليف غير قابلة للإلغاء ترتبت على المشروع بموافقة الطرف الثاني، ولا يترتب على الإلغاء إعفاء الطرف الثاني من سداد ما استحق حتى تاريخ الإلغاء.</li>
    <li>الخدمات والأنظمة الخارجية: أي خدمات أو اشتراكات أو رسوم تخص جهات أو منصات خارجية، مثل الاستضافة أو اسم النطاق أو بوابات الدفع أو خدمات الرسائل أو حسابات التطبيقات أو أي خدمات طرف ثالث، لا تعد ضمن التزامات الطرف الأول إلا إذا كانت منصوصاً عليها صراحة في العرض الفني أو عرض السعر، وتكون تكلفتها وفقاً لما هو متفق عليه بين الطرفين.</li>
    <li>الاعتمادات والموافقات الكتابية: تكون أي موافقات أو اعتمادات لمراحل المشروع أو طلبات إضافية أو تغييرات في نطاق العمل بموافقة كتابية من الطرف الثاني عبر وسيلة التواصل المعتمدة بين الطرفين، ويُعتد بها في تحديد نطاق العمل والمدة والتكلفة عند الحاجة.</li>
  </ol>
  <p>ويعتبر هذا البند مكملاً لبنود العقد دون إلغاء أو حذف أو تعديل أي من النصوص الواردة فيه، مع الالتزام بما هو متفق عليه في العرض الفني الخاص بالمشروع والتطبيق وملحق المواصفات الفنية.</p>

  <div class="sign">
    <div><b>الطرف الأول (الشركة المنفذة)</b>الاسم / ${COMPANY.manager}<br>الصفة / المدير المسئول<br>التوقيع / ............................<br>الختم / ............................</div>
    <div><b>الطرف الثاني (العميل)</b>الاسم / ${fill(d.signatoryName || (company ? d.representativeName : d.clientName), "............................")}<br>الصفة / ${fill(d.signatoryTitle, "............................")}<br>التوقيع / ............................<br>&nbsp;</div>
  </div>`;
  return shell("عقد اتفاق على تنفيذ وتطوير مشروع تقني", body, opts);
}

export function buildFreelancerContractHtml(d: FreelancerContractData, opts: ContractHtmlOptions = {}): string {
  const calc = computeStages(d.amount, d.stages, d.showPaid ? d.paidSoFar : 0);
  const paidCols = d.showPaid;
  const rows = calc.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.pct}%</td><td class="num">${formatMoney(r.amount)} ج.م</td>${paidCols ? `<td class="num paid">${formatMoney(r.paid)}</td>` : ""}<td>${fill(r.due, "..................")}</td><td>${fill(r.deliverable, "..................")}</td></tr>`).join("");

  const body = `
  <h1>عقد تنفيذ مشروع كمستقل</h1>
  <div class="refbox"><span>اسم المشروع: ${fill(d.projectName)}</span><span>رقم العقد الأصلي: ${fill(d.originalContractNumber)}</span></div>
  <p>إنه في يوم ${fill(arabicDayName(d.contractDate), "................")} الموافق ${dateFill(d.contractDate)} تم الاتفاق بين ${COMPANY.name}، ويمثلها السيد/ ${COMPANY.manager} بصفته المدير المسؤول، ويشار إليها بـ «الطرف الأول»، وبين السيد/ ${fill(d.freelancerName, "........................................................")} ويشار إليه بـ «الطرف الثاني» أو «منفذ العمل»، وذلك باعتبارهما طرفي عقد تنفيذ مشروع برمجي/تقني مؤرخ في ${dateFill(d.originalContractDate)} ويشار إليه فيما بعد بـ «العقد الأصلي».</p>

  <h2>البند الأول: حجية الملحق</h2>
  <p>يُعد هذا الملحق جزءًا لا يتجزأ من العقد الأصلي ومكمّلًا له، وتسري أحكام العقد الأصلي فيما لم يرد بشأنه نص خاص في هذا الملحق. وفي حال التعارض، تسري أحكام هذا الملحق في حدود موضوع مراحل السداد والتسليم والصيانة. ويقر الطرفان بأن توقيعهما على هذا الملحق يُعد اعتمادًا نهائيًا لما ورد فيه.</p>

  <h2>البند الثاني: قيمة التنفيذ</h2>
  <p>اتفق الطرفان على أن إجمالي المقابل المالي المستحق للطرف الثاني عن تنفيذ المشروع محل العقد الأصلي هو مبلغ وقدره ${d.amount ? fill(`${formatMoney(d.amount)} جنيه مصري`) : fill("", "............")} فقط ${d.amount ? fill(`${amountToArabicWords(d.amount)} جنيه مصري`) : fill("", "....................................")} لا غير، وذلك مقابل تنفيذ نطاق العمل والمخرجات المعتمدة في العقد الأصلي وملحق المشروع.</p>

  <h2>البند الثالث: جدول الدفعات</h2>
  ${calc.valid ? "" : `<div class="warn">تنبيه: مجموع نسب الدفعات = ${calc.pctSum}% ويجب أن يساوي 100%.</div>`}
  <table class="pay">
    <colgroup><col style="width:9%"><col style="width:8%"><col style="width:14%">${paidCols ? '<col style="width:11%">' : ""}<col style="width:${paidCols ? 24 : 28}%"><col></colgroup>
    <thead><tr><th>الدفعة</th><th>النسبة</th><th>المبلغ</th>${paidCols ? "<th>المسدد</th>" : ""}<th>موعد الاستحقاق</th><th>المخرج المرتبط</th></tr></thead>
    <tbody>${rows}<tr class="total"><td>الإجمالي</td><td class="num">${calc.pctSum}%</td><td class="num">${formatMoney(calc.totalAllocated)} ج.م</td>${paidCols ? `<td class="num paid">${formatMoney(calc.paid)}</td>` : ""}<td colspan="2">${paidCols ? `المتبقي: <span class="due">${formatMoney(calc.remaining)} ج.م</span>` : ""}</td></tr></tbody>
  </table>
  <p>تُسدد كل دفعة خلال ${fill(d.payWithinDays, "........")} أيام عمل من تاريخ استحقاقها وبموجب إيصال أو مطالبة سداد. ويجوز للطرف الثاني تسليم أي مرحلة قبل الموعد التقديري متى اكتملت متطلباتها الفنية وأصبحت جاهزة للاختبار؛ وفي هذه الحالة تستحق الدفعة المرتبطة بها بعد التسليم والقبول أو اعتبار المرحلة مقبولة وفقًا للبند الرابع من هذا الملحق.</p>
  <p>لا يلتزم الطرف الأول بسداد دفعة مرحلة قبل إتاحة مخرجها فعليًا للفحص، ولا يجوز للطرف الثاني الانتقال إلى تنفيذ مخرجات المرحلة التالية إذا كان استحقاقها مرتبطًا بسداد دفعة لم تُسدد، ما لم يوافق الطرف الأول كتابيًا.</p>

  <h2>البند الرابع: الفحص والقبول والملاحظات</h2>
  <p>يلتزم الطرف الأول بفحص كل مرحلة خلال خمسة أيام عمل من تاريخ إتاحتها، وإرسال ملاحظاته المكتوبة والمحددة المتعلقة بعدم المطابقة لنطاق العمل أو معايير القبول. ويلتزم الطرف الثاني دون مقابل إضافي بإصلاح العيوب التي تثبت مخالفتها للنطاق أو المواصفات المعتمدة.</p>
  <p>إذا لم يرسل الطرف الأول ملاحظات جوهرية مكتوبة خلال مدة الفحص، أو استخدم مخرج المرحلة في التشغيل أو أتاحه للعميل، تُعتبر المرحلة مقبولة لأغراض استحقاق دفعتها، دون إخلال بحق الطرف الأول في طلب إصلاح عيب جوهري خفي خلال فترة الضمان.</p>
  <p>لا تشمل الملاحظات المجانية الخصائص الجديدة أو تغيير نطاق العمل أو تغيير التصميم المعتمد أو التكاملات الجديدة أو أي طلب صادر من عميل الطرف الأول مباشرة دون اعتماد كتابي من الطرف الأول.</p>

  <h2>البند الخامس: التسليم النهائي والسورس كود</h2>
  <p>تستحق الدفعة الأخيرة بعد إتمام الاختبارات والتكامل النهائي وإخطار الطرف الأول بجاهزية المشروع للتسليم النهائي. ويلتزم الطرف الأول بسداد الدفعة الأخيرة خلال المدة المحددة، ويلتزم الطرف الثاني خلال خمسة أيام عمل من استلامها بتسليم السورس كود النهائي، ومستودع الكود، وملفات الإعداد والنشر، والتوثيق، وبيانات الوصول والحسابات المرتبطة بالمشروع، وأي مخرجات تم إنشاؤها خصيصًا للمشروع.</p>
  <p>تكون الحسابات الأساسية الخاصة بالمشروع، متى أمكن، تحت سيطرة الطرف الأول من البداية، بما في ذلك مستودع الكود والاستضافة والخدمات السحابية وقواعد البيانات والخدمات الخارجية. وإذا استُخدم حساب شخصي مؤقت بموافقة الطرف الأول، يلتزم الطرف الثاني بنقل السيطرة أو صلاحية الوصول عند التسليم النهائي أو عند طلب الطرف الأول، بما لا يتعارض مع حقوقه المالية المستحقة.</p>
  <p>لا يجوز للطرف الثاني حذف بيانات الطرف الأول أو بيانات العميل أو تعطيل ما تم تنفيذه أو وضع أكواد خفية أو أبواب خلفية أو وسائل تمنع الطرف الأول من تشغيل المشروع أو صيانته أو تطويره.</p>

  <h2>البند السادس: الصيانة والدعم الفني المجاني</h2>
  <p>يلتزم الطرف الثاني بتقديم صيانة ودعم فني مجانيين لمدة ثلاثة أشهر تبدأ من تاريخ التسليم النهائي وقبول المشروع، دون مقابل إضافي.</p>
  <p>تشمل الصيانة المجانية إصلاح الأخطاء البرمجية والعيوب الفنية التي تمنع الوظائف المتفق عليها في نطاق المشروع من العمل بصورة صحيحة، ومعالجة المشكلات الناتجة عن التنفيذ الأصلي، وتقديم دعم فني معقول متعلق بتشغيل المخرجات المسلمة.</p>
  <p>لا تشمل الصيانة إضافة خصائص جديدة، أو تغيير التصميم أو نطاق العمل، أو إدخال تكاملات جديدة، أو زيادة أعداد المستخدمين أو الكتب أو اللغات، أو رسوم الاستضافة والخدمات الخارجية، أو الأعطال الناتجة عن تدخل الطرف الأول أو العميل أو أي طرف ثالث، أو سوء الاستخدام، أو تغيير إعدادات البيئة أو سياسات مزودي الخدمات الخارجية.</p>
  <p>يلتزم الطرف الثاني ببدء فحص البلاغات الحرجة التي توقف وظيفة أساسية خلال يوم عمل قدر الإمكان، والبلاغات غير الحرجة خلال ثلاثة أيام عمل، على أن تتحدد مدة الإصلاح بحسب طبيعة العطل وسببه. وبعد انتهاء مدة الأشهر الثلاثة، لا تستمر الصيانة إلا بموجب اتفاق مكتوب مستقل يحدد النطاق والقيمة والمدة.</p>

  <h2>البند السابع: مدة التنفيذ والتغيير</h2>
  <p>تكون مدة كل مرحلة من مراحل المشروع والمواعيد التقديرية الخاصة بها وفقًا لما ورد تفصيلًا في العرض الفني المرفق بالعقد الأصلي، والذي أرسله الطرف الأول إلى الطرف الثاني واطلع عليه الطرف الثاني ووافق عليه، ويُعد العرض الفني المرجع المعتمد في تحديد مدد المراحل ومخرجاتها. ويجوز التسليم المبكر لأي مرحلة متى اكتملت متطلباتها الفنية وأصبحت جاهزة للاختبار، ولا يُعد التسليم المبكر إخلالًا بالجدول الزمني أو التزامًا بتسليم باقي المراحل قبل اكتمال متطلباتها. ولا يجوز تمديد مدة أي مرحلة أو تعديل موعدها إلا بسبب راجع إلى الطرف الأول أو المدخلات أو الاعتمادات أو الخدمات الخارجية أو طلب تغيير مكتوب، وبقدر الأثر الفعلي لذلك السبب.</p>
  <p>أي طلب أو خاصية أو تعديل خارج نطاق العقد الأصلي وملحق المشروع لا ينفذ إلا بموافقة كتابية من الطرف الأول تحدد الوصف والتكلفة والأثر على المدة. ولا تُعد مناقشة الطلب أو طلب تقدير تكلفته موافقة على تنفيذه.</p>

  <h2>البند الثامن: استمرار باقي الأحكام والتوقيع</h2>
  <p>تظل جميع بنود العقد الأصلي، وبالأخص السرية وحماية بيانات العملاء والملكية الفكرية وعدم التعامل المباشر مع العملاء وأمن المعلومات والإنهاء والمسؤولية، سارية وملزمة للطرفين. يقر الطرفان بقراءة هذا الملحق وفهمه والموافقة عليه، ويحرر من نسختين أصليتين بيد كل طرف نسخة.</p>

  <div class="sign">
    <div><b>الطرف الأول – شركة فراتيلانزا</b>الاسم: ${COMPANY.manager}<br>الصفة: المدير المسؤول<br>التوقيع: ........................<br>الختم: ........................<br>التاريخ: ${dateFill(d.contractDate)}</div>
    <div><b>الطرف الثاني – منفذ العمل</b>الاسم: ${fill(d.freelancerName)}<br>الرقم القومي: ${fill(d.freelancerNationalId)}<br>التوقيع: ........................<br>&nbsp;<br>التاريخ: ${dateFill(d.contractDate)}</div>
  </div>
`;
  return shell("عقد تنفيذ مشروع كمستقل", body, opts);
}

/* ───────────────────────── Output ───────────────────────── */

/** Opens the contract in a new tab and shows the print dialog (choose "Save as PDF"). */
export function printContractHtml(html: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html.replace("</body>", `<script>window.onload=function(){(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print();},250);});};</script></body>`));
  w.document.close();
  return true;
}

/** Word-compatible copy (.doc) for last-minute edits. */
export function downloadContractWord(html: string, fileName: string) {
  const blob = new Blob([`﻿${html}`], { type: "application/msword;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName.endsWith(".doc") ? fileName : `${fileName}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
}
