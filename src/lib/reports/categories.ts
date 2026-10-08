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

/** F101 § The severity scale: 1 child safety or illegal, 2 threats and harassment, 3 sensitive or adult, 4 spam and other.
 *  The reporter's sensitive-content reason is read as tier 1 (it covers children), the cautious reading until a person or the AI says otherwise. */
export const SEVERITY_OF_REPORT_CATEGORY: Record<ReportCategory, 1 | 2 | 3 | 4> = {
  sensitive_content: 1,
  threat_of_harm: 2,
  violence: 2,
  harassment: 2,
  nudity: 3,
  spam: 4,
  other: 4,
}

export const categoryLabel = (c: ReportCategory) => REPORT_CATEGORIES.find((x) => x.value === c)!.label
