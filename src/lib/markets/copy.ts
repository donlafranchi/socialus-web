// #955 — every word about vendors at markets. Placeholder ([public-is-draft]): new copy goes to Don in a human-review PR.
export const MARKET_COPY = {
  findUsWeekly: (weekdays: string, hours: string, market: string) => `Find us ${weekdays} ${hours} at ${market}`,
  findUsOn: (date: string, hours: string, market: string) => `Find us ${date}, ${hours} at ${market}`,
  stallReminder: (market: string, hours: string) => `They're at ${market} tomorrow, ${hours}.`,
  coming: (names: string) => `Coming: ${names}.`,
  vendorsHeading: (weekday: string) => `This ${weekday}'s vendors`,
  vendorsCount: (n: number, weekday: string) => `${n} ${n === 1 ? 'vendor' : 'vendors'} this ${weekday}`,
  noVendorsYet: 'No vendors have added themselves for this day yet.',
  // Vendor settings
  sellAtMarkets: 'I sell at markets',
  sellAtMarketsHint: 'Pick the market and when you are there. People who follow you get a reminder the day before.',
  findMarket: 'Find a market',
  noMarketFound: 'No market by that name yet.',
  everyMarketDay: (weekdays: string) => `Every ${weekdays.replace(/s$/, '')}`,
  specificDates: 'Specific dates',
  addDate: 'Add a date',
  skipThisWeek: 'Skipping this week',
  skipping: (date: string) => `Skipping ${date}`,
  undoSkip: 'I will be there',
  leaveMarket: 'Remove this market',
  // Market organiser
  confirm: 'Confirm',
  confirmed: 'Confirmed',
  removeVendor: 'Remove',
} as const
