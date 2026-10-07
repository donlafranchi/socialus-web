// F078 criterion 3 — what a poster is told when something of theirs is hidden:
// the category and the reporter's chosen reason in plain words, never the
// reporter's identity or what they wrote. Placeholder copy ([public-is-draft]),
// kind and gracious (criterion 11): Don's to word.

import { categoryLabel, type ReportCategory } from './categories'

export function hiddenNoticeMessage(pageName: string, category: ReportCategory, kind: 'group' | 'post' = 'group'): string {
  const what = kind === 'post' ? 'a post on' : 'the photo on'
  return `Someone reported ${what} ${pageName} as "${categoryLabel(category)}", so we've hidden it while we take a look. Nothing is deleted.`
}
