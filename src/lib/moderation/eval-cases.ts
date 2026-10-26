// F100 criterion 10 — what a case in the labelled set must carry. Pure, so the
// rules are tested without a model: photos only from licensed, open or
// synthetic sources with the licence recorded per image; no image of a minor in
// any sensitive context; no sexual imagery of anyone.

import { ASSESS_CATEGORIES, SEVERITY_BY_CATEGORY, type AssessCategory } from './rules'

export type CaseKind = 'clean' | 'borderline' | 'violating'

export interface EvalCase {
  id: string
  text: string
  /** Relative to evals/moderation/images/. */
  image?: string
  reporterReason: string
  /** Clean and borderline are approved; violating is removed. */
  kind: CaseKind
  label: { outcome: 'approve' | 'remove'; severity: number; category: AssessCategory }
}

export interface ImageLicence {
  file: string
  /** Where it came from: for a real photo, its file page. */
  source: string
  licence: string
  /** What the picture shows, in a word. */
  subject: string
  /** Who made it; required when the licence asks for attribution. */
  author?: string
  /** Only 'ordinary-public' is accepted, and only for the children rule's photo. */
  setting?: 'ordinary-public'
}

/** The smallest set whose recall and false-alarm numbers mean anything. */
export const MIN_CASES = 40

const ALLOWED_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'public-domain', 'synthetic']
const FORBIDDEN_SUBJECTS = /minor|child|kid|baby|teen|sexual|nude|explicit/i
/** The one subject the children rule may be tested with: an ordinary public-setting stock photo (criterion 10). */
export const CHILDREN_RULE_SUBJECT = 'children-in-an-ordinary-public-setting'
const EXPLICIT_WORDS = /\b(explicit|porn|xxx|sex tape|nude photos?)\b/i

const isChildrenPhoto = (l: ImageLicence | undefined) => l?.subject === CHILDREN_RULE_SUBJECT

/** Problems with the set, one line each; empty means it is fit to run. */
export function validateSet(cases: EvalCase[], licences: ImageLicence[], exists: (file: string) => boolean): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const byFile = new Map(licences.map((l) => [l.file, l]))

  for (const l of licences) {
    if (!ALLOWED_LICENCES.includes(l.licence)) problems.push(`${l.file}: licence "${l.licence}" is not one of ${ALLOWED_LICENCES.join(', ')}`)
    if (!l.source) problems.push(`${l.file}: no source recorded`)
    if (isChildrenPhoto(l)) {
      if (l.setting !== 'ordinary-public') problems.push(`${l.file}: subject "${l.subject}" needs setting "ordinary-public"`)
      if (l.licence === 'synthetic') problems.push(`${l.file}: a synthetic picture of children is not allowed in the set`)
    } else if (FORBIDDEN_SUBJECTS.test(l.subject)) problems.push(`${l.file}: subject "${l.subject}" is not allowed in the set`)
  }

  for (const c of cases) {
    if (seen.has(c.id)) problems.push(`${c.id}: duplicate id`)
    seen.add(c.id)
    if (!c.text && !c.image) problems.push(`${c.id}: needs words or an image`)
    if (!(c.label.severity >= 1 && c.label.severity <= 4)) problems.push(`${c.id}: severity must be 1 to 4`)
    if (!(ASSESS_CATEGORIES as readonly string[]).includes(c.label.category as string)) problems.push(`${c.id}: label needs a category, one of ${ASSESS_CATEGORIES.join(', ')}`)
    if (!['clean', 'borderline', 'violating'].includes(c.kind)) problems.push(`${c.id}: kind must be clean, borderline or violating`)
    else if (c.kind === 'violating' && c.label.outcome !== 'remove') problems.push(`${c.id}: a violating case's outcome is remove`)
    else if (c.kind !== 'violating' && c.label.outcome !== 'approve') problems.push(`${c.id}: a ${c.kind} case's outcome is approve`)
    if (c.kind === 'violating' && c.label.category in SEVERITY_BY_CATEGORY && c.label.severity !== SEVERITY_BY_CATEGORY[c.label.category]) {
      problems.push(`${c.id}: severity ${c.label.severity} does not match its category (severity ${SEVERITY_BY_CATEGORY[c.label.category]})`)
    }
    if (c.image) {
      const lic = byFile.get(c.image)
      if (!lic) problems.push(`${c.id}: ${c.image} has no licence record`)
      else if (!exists(c.image)) problems.push(`${c.id}: ${c.image} is missing`)
      else if (isChildrenPhoto(lic) && c.label.category !== 'sensitive_child') problems.push(`${c.id}: ${c.image} shows children, so it may only be used by a case for the children rule`)
    }
  }
  // A photo of children that no case uses for the children rule is a photo that should not be in the folder.
  for (const l of licences) {
    if (isChildrenPhoto(l) && !cases.some((c) => c.image === l.file)) problems.push(`${l.file}: shows children and is not used by any case for the children rule`)
  }
  return problems
}

/** Whether the set is big and varied enough to mean something (criterion 10), one line per gap. */
export function validateCoverage(cases: EvalCase[], licences: ImageLicence[]): string[] {
  const problems: string[] = []
  if (cases.length < MIN_CASES) problems.push(`the set has ${cases.length} cases; it needs at least ${MIN_CASES}`)
  for (const kind of ['clean', 'borderline', 'violating'] as const) {
    if (!cases.some((c) => c.kind === kind)) problems.push(`no ${kind} case`)
  }
  const violating = cases.filter((c) => c.kind === 'violating')
  for (const category of ASSESS_CATEGORIES.filter((c) => c !== 'other')) {
    if (!violating.some((c) => c.label.category === category)) problems.push(`no violating case for the category ${category}`)
  }
  const byFile = new Map(licences.map((l) => [l.file, l]))
  if (!violating.some((c) => c.label.category === 'sensitive_child' && c.image && isChildrenPhoto(byFile.get(c.image)))) {
    problems.push('the children rule needs a case with an ordinary public-setting stock photo')
  }
  // The adult category: tested with words and non-explicit borderline, never with sexual imagery.
  if (!violating.some((c) => c.label.category === 'nudity' && c.text && !c.image)) problems.push('the adult category needs a violating case tested with text')
  if (!cases.some((c) => c.kind === 'borderline' && c.label.outcome === 'approve' && /adult|life drawing|nude art|swimwear|lingerie|boudoir|burlesque|figure/i.test(c.text))) {
    problems.push('the adult category needs a non-explicit borderline case beside it')
  }
  for (const c of cases) if (EXPLICIT_WORDS.test(c.text)) problems.push(`${c.id}: explicit wording is not allowed in the set`)
  return problems
}

/** The media type the harness sends for a picture: the file's own, since the set mixes generated PNGs and stock JPEGs. */
export const imageMediaType = (file: string): 'image/png' | 'image/jpeg' => (/\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png')
