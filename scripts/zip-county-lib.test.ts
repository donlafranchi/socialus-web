import { describe, it, expect } from 'vitest'
import { rows, largest, connecticutRegions } from './zip-county-lib'

// bug #905: a Connecticut zip goes to the planning region whose county subdivisions hold most of its land.
const H = 'GEOID_ZCTA5_20|GEOID_COUSUB_20|AREALAND_PART'
const zipCousub = rows(
  [
    H,
    '06103|0900337070|900', // Hartford town, old Hartford County → Capitol
    '06103|0900310000|200', // a neighbour in Capitol too
    '06510|0900952070|500', // New Haven town → South Central
    '06498|0900776570|300', // Westbrook (Lower CT River Valley)
    '06498|0900766000|350', // Old Saybrook... same region
    '06498|0900995000|400', // a South Central town: biggest single part, smaller region total
    '06390|3610349000|800', // Fishers Island NY: a different state, never picked
    '06390|0901148620|100',
    '|0900337070|50', // land in no zip
  ].join('\n'),
)
const gaz = rows(
  [
    'USPS\tGEOID\tNAME   ',
    'CT\t0911037070\tHartford town   ',
    'CT\t0911010000\tBloomfield town',
    'CT\t0917052070\tNew Haven town',
    'CT\t0913076570\tWestbrook town',
    'CT\t0913066000\tOld Saybrook town',
    'CT\t0917095000\tSouth Central town',
    'CT\t0918048620\tSoutheastern town',
  ].join('\n'),
)

describe('bug #905 — Connecticut zips map to planning regions', () => {
  it('takes the region with the largest land share, summed over its subdivisions', () => {
    const r = connecticutRegions(['06103', '06510', '06498'], zipCousub, gaz)
    expect(r.get('06103')).toEqual({ fips: '09110', spans: 1 })
    expect(r.get('06510')).toEqual({ fips: '09170', spans: 1 })
    expect(r.get('06498')).toEqual({ fips: '09130', spans: 2 })
  })

  it('counts land over the state line toward the guess but never picks it', () => {
    expect(connecticutRegions(['06390'], zipCousub, gaz).get('06390')).toEqual({ fips: '09180', spans: 2 })
  })

  it('fails loudly on a subdivision the gazetteer does not place', () => {
    const bad = rows([H, '06999|0900199999|10'].join('\n'))
    expect(() => connecticutRegions(['06999'], bad, gaz)).toThrow(/no planning region/)
  })

  it('leaves the plain largest-share pick as it was', () => {
    expect(largest(zipCousub, 'GEOID_ZCTA5_20', 'AREALAND_PART', 'GEOID_COUSUB_20').get('06498')).toBe('0900995000')
  })
})
