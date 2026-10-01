// F078 criterion 1 — the reasons a reporter picks from; F080 (2026-10-01)
// widened "children" to sensitive content. Labels are placeholders, Don's to
// word ([public-is-draft]).

export const REPORT_CATEGORIES = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'nudity', label: 'Nudity' },
  { value: 'spam', label: 'Spam' },
  { value: 'violence', label: 'Violence' },
  {
    value: 'sensitive_content',
    label: "Sensitive content — children, animals and pets, or anyone who can't fend for themselves",
  },
  { value: 'threat_of_harm', label: 'Threat of harm' },
  { value: 'other', label: 'Something else' },
] as const

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]['value']

export const REPORT_CATEGORY_VALUES = REPORT_CATEGORIES.map((c) => c.value) as [ReportCategory, ...ReportCategory[]]

/** F078 criteria 5 and 8: hides regardless of the bar, and texts Don. */
export const URGENT_CATEGORIES: readonly ReportCategory[] = ['sensitive_content', 'threat_of_harm']

export const categoryLabel = (c: ReportCategory) => REPORT_CATEGORIES.find((x) => x.value === c)!.label
