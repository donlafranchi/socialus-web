// F078 criterion 3 — what a poster is told when something of theirs is hidden:
// the category and the reporter's chosen reason in plain words, never the
// reporter's identity or what they wrote. Placeholder copy ([public-is-draft]),
// kind and gracious (criterion 11): Don's to word.

import { categoryLabel, type ReportCategory } from './categories'

/** What a report is about. #625 adds a Page's own words (its name and description). */
export type ReportSubjectKind = 'group' | 'post' | 'page_picture' | 'post_photo' | 'page_words'

export function hiddenNoticeMessage(pageName: string, category: ReportCategory, kind: ReportSubjectKind = 'group'): string {
  const what =
    kind === 'post' ? 'a post on' : kind === 'page_picture' ? 'the picture on' : kind === 'post_photo' ? 'a photo on a post on' : kind === 'page_words' ? 'the name or description of' : 'the photo on'
  return `Someone reported ${what} ${pageName} as "${categoryLabel(category)}". We've hidden it while a person from our team takes a look. Nothing's been deleted, and you can answer below.`
}

export function courtesyNoticeMessage(category: ReportCategory, kind: ReportSubjectKind = 'group'): string {
  const what =
    kind === 'post' ? 'your post' : kind === 'page_picture' ? 'your Page picture' : kind === 'post_photo' ? 'a photo on your post' : kind === 'page_words' ? "your Page's name or description" : 'your Page photo'
  return `Someone reported ${what} as "${categoryLabel(category)}". Does this seem like a mistake? You can edit it and resubmit. If it gets reported again, tap "This is a mistake" and we'll put it at the top of our review list.`
}
