// F100 criterion 10 — what a case in the labelled set must carry. Pure, so the
// rules are tested without a model: photos only from licensed, open or
// synthetic sources with the licence recorded per image; no image of a minor in
// any sensitive context; no sexual imagery of anyone.

export interface EvalCase {
  id: string
  text: string
  /** Relative to evals/moderation/images/. */
  image?: string
  reporterReason: string
  label: { outcome: 'approve' | 'remove'; severity: number }
}

export interface ImageLicence {
  file: string
  source: string
  licence: string
  /** What the picture shows, in a word. */
  subject: string
}

const ALLOWED_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'public-domain', 'synthetic']
const FORBIDDEN_SUBJECTS = /minor|child|kid|baby|teen|sexual|nude|explicit/i

/** Problems with the set, one line each; empty means it is fit to run. */
export function validateSet(cases: EvalCase[], licences: ImageLicence[], exists: (file: string) => boolean): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const byFile = new Map(licences.map((l) => [l.file, l]))

  for (const l of licences) {
    if (!ALLOWED_LICENCES.includes(l.licence)) problems.push(`${l.file}: licence "${l.licence}" is not one of ${ALLOWED_LICENCES.join(', ')}`)
    if (FORBIDDEN_SUBJECTS.test(l.subject)) problems.push(`${l.file}: subject "${l.subject}" is not allowed in the set`)
    if (!l.source) problems.push(`${l.file}: no source recorded`)
  }

  for (const c of cases) {
    if (seen.has(c.id)) problems.push(`${c.id}: duplicate id`)
    seen.add(c.id)
    if (!c.text && !c.image) problems.push(`${c.id}: needs words or an image`)
    if (!(c.label.severity >= 1 && c.label.severity <= 4)) problems.push(`${c.id}: severity must be 1 to 4`)
    if (c.image) {
      if (!byFile.has(c.image)) problems.push(`${c.id}: ${c.image} has no licence record`)
      else if (!exists(c.image)) problems.push(`${c.id}: ${c.image} is missing`)
    }
  }
  return problems
}
