// #347 — the metros the boundary loader knows. Adding a metro is an entry
// here: its CBSA, its counties, and any city that publishes neighbourhoods.

export interface NeighbourhoodSource {
  /** The `places` city the neighbourhoods sit in. */
  citySlug: string
  source: string
  /** An ArcGIS FeatureServer or MapServer layer that answers `query?f=geojson`. */
  url: string
  nameField: string
  idField: string
  licence: string
  vintage: string
}

export interface Metro {
  msa: string
  stateFips: string
  stateSlug: string
  counties: string[]
  neighbourhoods: NeighbourhoodSource[]
}

export const TIGER = {
  vintage: 'TIGER/Line 2025',
  licence: 'Public domain (17 U.S.C. § 105), US Census Bureau',
  counties: 'https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip',
  places: (state: string) => `https://www2.census.gov/geo/tiger/TIGER2025/PLACE/tl_2025_${state}_place.zip`,
  tracts: (state: string) => `https://www2.census.gov/geo/tiger/TIGER2025/TRACT/tl_2025_${state}_tract.zip`,
}

export const METROS: Record<string, Metro> = {
  sacramento: {
    msa: '40900',
    stateFips: '06',
    stateSlug: 'ca',
    // El Dorado, Placer, Sacramento, Yolo.
    counties: ['017', '061', '067', '113'],
    neighbourhoods: [
      {
        citySlug: 'sacramento',
        source: 'City of Sacramento open data, Neighborhoods',
        url: 'https://services5.arcgis.com/54falWtcpty3V47Z/arcgis/rest/services/Neighborhoods/FeatureServer/0',
        nameField: 'NAME',
        idField: 'OBJECTID',
        licence: 'City of Sacramento Open Data Terms (provided as is)',
        vintage: '2018',
      },
      {
        citySlug: 'west-sacramento',
        source: 'City of West Sacramento GIS, neighborhoods',
        url: 'https://gis.cityofwestsacramento.org/server/rest/services/neighborhoods/FeatureServer/0',
        nameField: 'NB',
        idField: 'OBJECTID_1',
        licence: 'City of West Sacramento GIS disclaimer (provided as is)',
        vintage: '2026',
      },
    ],
  },
}
