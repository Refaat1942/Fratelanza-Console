export const PAYMENT_METHODS = [
  { value: "bank_transfer", labelEn: "Bank transfer (company account)", labelAr: "تحويل بنكي على حساب الشركة" },
  { value: "vodafone_cash", labelEn: "Vodafone Cash", labelAr: "فودافون كاش" },
  { value: "instapay", labelEn: "InstaPay", labelAr: "انستا باي" },
  { value: "check", labelEn: "Certified check", labelAr: "شيك مقبول الدفع" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function paymentMethodLabel(method: string, lang: string): string {
  const row = PAYMENT_METHODS.find((m) => m.value === method);
  if (!row) return method;
  return lang === "ar" ? row.labelAr : row.labelEn;
}
