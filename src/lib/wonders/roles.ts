// F117 — the eight helper roles from the Wonders playbook. The database's check holds the same list.
export const WONDER_ROLES = ['lead', 'designer', 'pattern_maker', 'sourcing', 'quality', 'logistics', 'support', 'treasurer'] as const
export type WonderRole = (typeof WONDER_ROLES)[number]
export const WONDER_OPTION_MAX = 40
export const WONDER_OPTIONS_MAX = 12
export const WONDER_NOTE_MAX = 140
