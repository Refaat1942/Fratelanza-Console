/** Company expense categories. Freelancer payments are not expenses — they are recorded on projects. */
export const EXPENSE_CATEGORIES = [
  { value: "rent", labelEn: "Rent", labelAr: "إيجار" },
  { value: "salaries", labelEn: "Salaries", labelAr: "رواتب" },
  { value: "marketing", labelEn: "Marketing & ads", labelAr: "تسويق وإعلانات" },
  { value: "software", labelEn: "Software & subscriptions", labelAr: "برمجيات واشتراكات" },
  { value: "utilities", labelEn: "Utilities & internet", labelAr: "مرافق وإنترنت" },
  { value: "transport", labelEn: "Transport", labelAr: "مواصلات" },
  { value: "office", labelEn: "Office supplies", labelAr: "مستلزمات مكتبية" },
  { value: "equipment", labelEn: "Equipment", labelAr: "معدات" },
  { value: "taxes", labelEn: "Taxes & government fees", labelAr: "ضرائب ورسوم حكومية" },
  { value: "bank_fees", labelEn: "Bank fees", labelAr: "رسوم بنكية" },
  { value: "other", labelEn: "Other", labelAr: "أخرى" },
] as const;

export function expenseCategoryLabel(value: string, lang: string): string {
  const row = EXPENSE_CATEGORIES.find((c) => c.value === value);
  if (!row) return value;
  return lang.startsWith("ar") ? row.labelAr : row.labelEn;
}
