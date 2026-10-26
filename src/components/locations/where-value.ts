// #896 — the "How do people find you?" answer as a plain value. Not a client
// module, so the server (whereValueFrom on the Edit page) reads real values,
// not client references.

export type WhereMode = 'visit' | 'landmark' | 'multi' | 'roaming' | 'travel' | 'online'
export type Place = { id: string; name: string }
export type ScheduleStop = { where: string; when: string }

export interface WhereValue {
  mode: WhereMode | null
  /** Street address, neighbourhood only (areaOnly), and a landmark's pin all live here. */
  visit: { pin: [number, number] | null; label: string | null; howToFind: string; areaOnly: boolean; area: Place | null }
  landmark: { text: string }
  multi: { addresses: string[] }
  travel: { towns: Place[] }
  roaming: { usuallyAround: string; stops: ScheduleStop[] }
  online: { note: string }
}

export const emptyWhere: WhereValue = {
  mode: null,
  visit: { pin: null, label: null, howToFind: '', areaOnly: false, area: null },
  landmark: { text: '' },
  multi: { addresses: ['', ''] },
  travel: { towns: [] },
  roaming: { usuallyAround: '', stops: [] },
  online: { note: '' },
}

