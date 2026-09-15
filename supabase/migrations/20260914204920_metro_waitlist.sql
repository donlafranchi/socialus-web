-- T163 (Issue #77) — F076: a person outside an open metro joins its waitlist.
--
-- Spec anchors:
--   planning/scenario-F076.md                     (approved 2026-09-14)
--   supabase/migrations/031_metro_polygons.sql    (§ D1/D2 — the overlay, CSA grain)
--   planning/adrs/ADR-0007-action-layer.md        (writes via the action layer)
--
-- Three things, in order: the metro catalog becomes every US metro; each metro
-- carries its own thresholds and its two counts; and a waitlist row records one
-- person's one choice.

------------------------------------------------------------
-- 1. metro_polygons becomes the catalog, not only the overlay
------------------------------------------------------------

-- F076 criterion 1: every US metro is present and selectable, and a person
-- cannot reach a state where their metro is absent. 295 of the 296 have no
-- boundary geometry, and do not need one: a person PICKS their metro from a
-- list (criterion 2 forbids IP, a default, and nearest-match), so nothing
-- geo-resolves an unopened metro.
--
-- `resolve_home_metro` is unaffected by the nullability: it tests
-- ST_Contains(geography, point), which is NULL — never true — for a row with
-- no polygon. An unopened metro therefore never becomes anyone's home metro,
-- which is the correct behaviour and not a new rule.
--
-- NAMING, recorded: this table is now a catalog of metros of which some have
-- polygons, and `metro_polygons` no longer describes it well. Renaming touches
-- migration 031, the definer-hardening migrations, resolve_home_metro,
-- feed-metro.ts and their tests; it is a separate, mechanical change and is
-- deliberately not bundled into a scenario ticket.
alter table public.metro_polygons alter column geography drop not null;
alter table public.metro_polygons alter column centroid  drop not null;

-- Which code `csa_code` holds for this row. A Metropolitan Statistical Area
-- belonging to no CSA has no CSA code, so it is carried at CBSA grain; the two
-- code spaces do not collide (CSA codes are 3 digits, CBSA codes 5), but which
-- one a row holds should be stated rather than inferred from length.
alter table public.metro_polygons
  add column code_kind text not null default 'csa'
      check (code_kind in ('csa', 'cbsa'));

-- Opening a metro is a deliberate act (criterion 12). NOTHING in this
-- migration, and nothing in the action layer, ever sets this. Crossing the
-- threshold makes a metro *eligible*; a person opens it.
alter table public.metro_polygons
  add column is_open boolean not null default false;

-- Criterion 11: thresholds are per-metro configuration, changeable with an
-- UPDATE — no migration and no deploy. A dense metro and a thin one do not
-- need the same floor, which is why these are columns and not constants.
--
-- 50 and 250 are the approved starting values and are expected to move.
-- Nothing about either number is a commitment to any member.
alter table public.metro_polygons
  add column creator_threshold int not null default 50 check (creator_threshold > 0),
  add column patron_threshold  int not null default 250 check (patron_threshold  > 0);

-- The two counts, stored separately (criterion 6) and both readable
-- independently of the single combined number the popup displays.
-- Maintained by the action layer in the same transaction as the waitlist row.
alter table public.metro_polygons
  add column creator_count int not null default 0 check (creator_count >= 0),
  add column patron_count  int not null default 0 check (patron_count  >= 0);

-- The one metro that is actually open. Its polygon, seeded by 031, is untouched.
update public.metro_polygons set is_open = true where slug = 'sacramento-roseville-ca';

comment on column public.metro_polygons.geography is
  'The CSA boundary, for metros the app can geo-resolve into. NULL for a metro that is only selectable on the waitlist — a person picks their metro from a list (F076 criterion 2 forbids IP, defaults and nearest-match), so an unopened metro needs no boundary. resolve_home_metro never matches a NULL polygon.';
comment on column public.metro_polygons.is_open is
  'Whether this metro is live. Opening is a deliberate act (F076 criterion 12): crossing the waitlist threshold marks a metro eligible and NEVER opens it. Nothing in the action layer writes this column.';
comment on column public.metro_polygons.creator_threshold is
  'Creators needed before this metro is eligible to open. Per-metro configuration, changeable by UPDATE with no migration and no deploy (F076 criterion 11). Starting value 50, expected to move; never a commitment to a member.';
comment on column public.metro_polygons.patron_threshold is
  'Patrons needed before this metro is eligible to open. See creator_threshold. Starting value 250.';
comment on column public.metro_polygons.creator_count is
  'Creators currently on this metro''s waitlist. Stored separately from patron_count (F076 criterion 6) and readable independently of the single combined number the popup shows. Maintained by the action layer in the same transaction as the waitlist row.';

------------------------------------------------------------
-- 2. public.metro_waitlist
------------------------------------------------------------

create table public.metro_waitlist (
  id          uuid        not null default gen_random_uuid() primary key,

  -- ONE ROW PER PERSON, enforced by the database rather than by the handler.
  -- Criterion 4 (idempotent: re-signup, re-visit or a second device increments
  -- nothing) and criterion 5 (changing metro MOVES the count) are both
  -- consequences of this single constraint: with one row per person, joining
  -- again is an update and there is no second row to strand or double-count.
  member_id   uuid        not null unique
                          references public.members(id) on delete cascade,

  metro_id    uuid        not null references public.metro_polygons(id) on delete cascade,

  -- Exactly one of two, and neither is pre-selected in the UI (criterion 3).
  -- No default here on purpose: a default is a pre-selection by another name,
  -- and it would let a caller omit the field and still create a row.
  role        text        not null check (role in ('creator', 'patron')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_metro_waitlist_metro on public.metro_waitlist (metro_id, role);

comment on table public.metro_waitlist is
  'One row per person: where they are waiting and whether they are here to make things or find them. The unique constraint on member_id is what makes joining idempotent by construction (F076 criterion 4) and makes changing metro a move rather than a duplicate (criterion 5) — neither is application-side de-duplication. Writes go through the action layer per ADR-7. Who joined is never ranked or displayed.';

alter table public.metro_waitlist enable row level security;

-- A person may read their own row, and nothing else. The counts a member is
-- allowed to see live on metro_polygons, which is public-readable; the rows
-- themselves are not, because "ranking or displaying who joined" is explicitly
-- out of scope and a readable waitlist is how that gets built by accident.
create policy metro_waitlist_select_own
  on public.metro_waitlist
  for select
  using (member_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy, per ADR-7. The action layer connects as the
-- table owner and bypasses RLS; a write policy would open a direct client path
-- that skips the counter maintenance above and the constraint's whole point.

------------------------------------------------------------
-- 3. The catalog seed — every US metro
------------------------------------------------------------
-- GENERATED by scripts/build-metro-catalog.ts from the U.S. Census
-- Core Based Statistical Areas delineation file, July 2023 (list1_2023.xlsx).
-- 296 metros: CSA grain where a CSA exists, else the
-- Metropolitan Statistical Area. Do not hand-edit; re-run the script.

insert into public.metro_polygons (name, slug, csa_code, code_kind)
values
  ('Abilene-Sweetwater, TX', 'abilene-sweetwater-tx', '101', 'csa'),
  ('Albany-Schenectady, NY', 'albany-schenectady-ny', '104', 'csa'),
  ('Albany, GA', 'albany-ga', '10500', 'cbsa'),
  ('Albuquerque-Santa Fe-Los Alamos, NM', 'albuquerque-santa-fe-los-alamos-nm', '105', 'csa'),
  ('Alexandria, LA', 'alexandria-la', '10780', 'cbsa'),
  ('Allentown-Bethlehem-East Stroudsburg, PA-NJ', 'allentown-bethlehem-east-stroudsburg-pa-nj', '106', 'csa'),
  ('Altoona-Huntingdon, PA', 'altoona-huntingdon-pa', '107', 'csa'),
  ('Amarillo-Borger, TX', 'amarillo-borger-tx', '108', 'csa'),
  ('Anchorage, AK', 'anchorage-ak', '11260', 'cbsa'),
  ('Anniston-Oxford, AL', 'anniston-oxford-al', '11500', 'cbsa'),
  ('Appleton-Oshkosh-Neenah, WI', 'appleton-oshkosh-neenah-wi', '118', 'csa'),
  ('Asheville-Waynesville-Brevard, NC', 'asheville-waynesville-brevard-nc', '120', 'csa'),
  ('Atlanta--Athens-Clarke County--Sandy Springs, GA-AL', 'atlanta-athens-clarke-county-sandy-springs-ga-al', '122', 'csa'),
  ('Augusta-Richmond County, GA-SC', 'augusta-richmond-county-ga-sc', '12260', 'cbsa'),
  ('Austin-Round Rock-San Marcos, TX', 'austin-round-rock-san-marcos-tx', '12420', 'cbsa'),
  ('Bakersfield-Delano, CA', 'bakersfield-delano-ca', '12540', 'cbsa'),
  ('Bangor, ME', 'bangor-me', '12620', 'cbsa'),
  ('Baton Rouge-Hammond, LA', 'baton-rouge-hammond-la', '132', 'csa'),
  ('Beaumont-Port Arthur, TX', 'beaumont-port-arthur-tx', '13140', 'cbsa'),
  ('Beckley, WV', 'beckley-wv', '13220', 'cbsa'),
  ('Bellingham, WA', 'bellingham-wa', '13380', 'cbsa'),
  ('Bend, OR', 'bend-or', '13460', 'cbsa'),
  ('Billings, MT', 'billings-mt', '13740', 'cbsa'),
  ('Binghamton, NY', 'binghamton-ny', '13780', 'cbsa'),
  ('Birmingham-Cullman-Talladega, AL', 'birmingham-cullman-talladega-al', '142', 'csa'),
  ('Bismarck, ND', 'bismarck-nd', '13900', 'cbsa'),
  ('Blacksburg-Christiansburg-Radford, VA', 'blacksburg-christiansburg-radford-va', '13980', 'cbsa'),
  ('Bloomington-Bedford, IN', 'bloomington-bedford-in', '144', 'csa'),
  ('Bloomington-Pontiac, IL', 'bloomington-pontiac-il', '145', 'csa'),
  ('Bloomsburg-Berwick-Sunbury, PA', 'bloomsburg-berwick-sunbury-pa', '146', 'csa'),
  ('Boise City-Mountain Home-Ontario, ID-OR', 'boise-city-mountain-home-ontario-id-or', '147', 'csa'),
  ('Boston-Worcester-Providence, MA-RI-NH', 'boston-worcester-providence-ma-ri-nh', '148', 'csa'),
  ('Bowling Green-Glasgow-Franklin, KY', 'bowling-green-glasgow-franklin-ky', '150', 'csa'),
  ('Bozeman, MT', 'bozeman-mt', '14580', 'cbsa'),
  ('Brookings-Crescent City, OR-CA', 'brookings-crescent-city-or-ca', '152', 'csa'),
  ('Brownsville-Harlingen-Raymondville, TX', 'brownsville-harlingen-raymondville-tx', '154', 'csa'),
  ('Brunswick-St. Simons, GA', 'brunswick-st-simons-ga', '15260', 'cbsa'),
  ('Buffalo-Cheektowaga-Olean, NY', 'buffalo-cheektowaga-olean-ny', '160', 'csa'),
  ('Burlington-Fort Madison, IA-IL', 'burlington-fort-madison-ia-il', '161', 'csa'),
  ('Burlington-South Burlington-Barre, VT', 'burlington-south-burlington-barre-vt', '162', 'csa'),
  ('Cape Coral-Fort Myers-Naples, FL', 'cape-coral-fort-myers-naples-fl', '163', 'csa'),
  ('Cape Girardeau-Sikeston, MO-IL', 'cape-girardeau-sikeston-mo-il', '164', 'csa'),
  ('Carbondale-Marion-Herrin, IL', 'carbondale-marion-herrin-il', '166', 'csa'),
  ('Casper, WY', 'casper-wy', '16220', 'cbsa'),
  ('Cedar Rapids-Iowa City, IA', 'cedar-rapids-iowa-city-ia', '168', 'csa'),
  ('Champaign-Urbana-Danville, IL', 'champaign-urbana-danville-il', '169', 'csa'),
  ('Charleston-Huntington-Ashland, WV-OH-KY', 'charleston-huntington-ashland-wv-oh-ky', '170', 'csa'),
  ('Charleston-North Charleston, SC', 'charleston-north-charleston-sc', '16700', 'cbsa'),
  ('Charlotte-Concord, NC-SC', 'charlotte-concord-nc-sc', '172', 'csa'),
  ('Charlottesville, VA', 'charlottesville-va', '16820', 'cbsa'),
  ('Chattanooga-Cleveland-Dalton, TN-GA-AL', 'chattanooga-cleveland-dalton-tn-ga-al', '174', 'csa'),
  ('Cheyenne, WY', 'cheyenne-wy', '16940', 'cbsa'),
  ('Chicago-Naperville, IL-IN-WI', 'chicago-naperville-il-in-wi', '176', 'csa'),
  ('Chico, CA', 'chico-ca', '17020', 'cbsa'),
  ('Cincinnati-Wilmington, OH-KY-IN', 'cincinnati-wilmington-oh-ky-in', '178', 'csa'),
  ('Clarksville, TN-KY', 'clarksville-tn-ky', '17300', 'cbsa'),
  ('Cleveland-Akron-Canton, OH', 'cleveland-akron-canton-oh', '184', 'csa'),
  ('College Station-Bryan, TX', 'college-station-bryan-tx', '17780', 'cbsa'),
  ('Colorado Springs, CO', 'colorado-springs-co', '17820', 'cbsa'),
  ('Columbia-Jefferson City-Moberly, MO', 'columbia-jefferson-city-moberly-mo', '190', 'csa'),
  ('Columbia-Sumter-Orangeburg, SC', 'columbia-sumter-orangeburg-sc', '192', 'csa'),
  ('Columbus-Auburn-Opelika, GA-AL', 'columbus-auburn-opelika-ga-al', '194', 'csa'),
  ('Columbus-Marion-Zanesville, OH', 'columbus-marion-zanesville-oh', '198', 'csa'),
  ('Corpus Christi-Kingsville-Alice, TX', 'corpus-christi-kingsville-alice-tx', '204', 'csa'),
  ('Crestview-Fort Walton Beach-Destin, FL', 'crestview-fort-walton-beach-destin-fl', '18880', 'cbsa'),
  ('Dallas-Fort Worth, TX-OK', 'dallas-fort-worth-tx-ok', '206', 'csa'),
  ('Davenport-Moline, IA-IL', 'davenport-moline-ia-il', '209', 'csa'),
  ('Dayton-Springfield-Kettering, OH', 'dayton-springfield-kettering-oh', '212', 'csa'),
  ('Decatur, IL', 'decatur-il', '19500', 'cbsa'),
  ('Denver-Aurora-Greeley, CO', 'denver-aurora-greeley-co', '216', 'csa'),
  ('Des Moines-West Des Moines-Ames, IA', 'des-moines-west-des-moines-ames-ia', '218', 'csa'),
  ('Detroit-Warren-Ann Arbor, MI', 'detroit-warren-ann-arbor-mi', '220', 'csa'),
  ('Dixon-Sterling, IL', 'dixon-sterling-il', '221', 'csa'),
  ('Dothan-Enterprise-Ozark, AL', 'dothan-enterprise-ozark-al', '222', 'csa'),
  ('Dubuque, IA', 'dubuque-ia', '20220', 'cbsa'),
  ('Duluth-Grand Rapids, MN-WI', 'duluth-grand-rapids-mn-wi', '228', 'csa'),
  ('Eagle Pass, TX', 'eagle-pass-tx', '20580', 'cbsa'),
  ('Eau Claire-Menomonie, WI', 'eau-claire-menomonie-wi', '232', 'csa'),
  ('Edwards-Rifle, CO', 'edwards-rifle-co', '233', 'csa'),
  ('El Centro, CA', 'el-centro-ca', '20940', 'cbsa'),
  ('El Paso-Las Cruces, TX-NM', 'el-paso-las-cruces-tx-nm', '238', 'csa'),
  ('Elmira-Corning, NY', 'elmira-corning-ny', '236', 'csa'),
  ('Enid, OK', 'enid-ok', '21420', 'cbsa'),
  ('Erie-Meadville, PA', 'erie-meadville-pa', '240', 'csa'),
  ('Eugene-Springfield, OR', 'eugene-springfield-or', '21660', 'cbsa'),
  ('Evansville-Henderson, IN-KY', 'evansville-henderson-in-ky', '241', 'csa'),
  ('Fairbanks-College, AK', 'fairbanks-college-ak', '21820', 'cbsa'),
  ('Fairmont-Clarksburg, WV', 'fairmont-clarksburg-wv', '242', 'csa'),
  ('Fargo-Wahpeton, ND-MN', 'fargo-wahpeton-nd-mn', '244', 'csa'),
  ('Farmington, NM', 'farmington-nm', '22140', 'cbsa'),
  ('Fayetteville-Lumberton-Pinehurst, NC', 'fayetteville-lumberton-pinehurst-nc', '246', 'csa'),
  ('Fayetteville-Springdale-Rogers, AR', 'fayetteville-springdale-rogers-ar', '22220', 'cbsa'),
  ('Findlay-Tiffin, OH', 'findlay-tiffin-oh', '248', 'csa'),
  ('Flagstaff, AZ', 'flagstaff-az', '22380', 'cbsa'),
  ('Florence-Muscle Shoals-Russellville, AL', 'florence-muscle-shoals-russellville-al', '250', 'csa'),
  ('Florence, SC', 'florence-sc', '22500', 'cbsa'),
  ('Fond du Lac, WI', 'fond-du-lac-wi', '22540', 'cbsa'),
  ('Fort Collins-Loveland, CO', 'fort-collins-loveland-co', '22660', 'cbsa'),
  ('Fort Smith, AR-OK', 'fort-smith-ar-ok', '22900', 'cbsa'),
  ('Fort Wayne-Huntington-Auburn, IN', 'fort-wayne-huntington-auburn-in', '258', 'csa'),
  ('Fresno-Hanford-Corcoran, CA', 'fresno-hanford-corcoran-ca', '260', 'csa'),
  ('Gadsden, AL', 'gadsden-al', '23460', 'cbsa'),
  ('Gainesville-Lake City, FL', 'gainesville-lake-city-fl', '264', 'csa'),
  ('Goldsboro, NC', 'goldsboro-nc', '24140', 'cbsa'),
  ('Grand Forks, ND-MN', 'grand-forks-nd-mn', '24220', 'cbsa'),
  ('Grand Island, NE', 'grand-island-ne', '24260', 'cbsa'),
  ('Grand Junction, CO', 'grand-junction-co', '24300', 'cbsa'),
  ('Grand Rapids-Wyoming, MI', 'grand-rapids-wyoming-mi', '266', 'csa'),
  ('Great Falls, MT', 'great-falls-mt', '24500', 'cbsa'),
  ('Green Bay-Shawano, WI', 'green-bay-shawano-wi', '267', 'csa'),
  ('Greensboro--Winston-Salem--High Point, NC', 'greensboro-winston-salem-high-point-nc', '268', 'csa'),
  ('Greenville-Spartanburg-Anderson, SC', 'greenville-spartanburg-anderson-sc', '273', 'csa'),
  ('Greenville-Washington, NC', 'greenville-washington-nc', '274', 'csa'),
  ('Gulfport-Biloxi, MS', 'gulfport-biloxi-ms', '25060', 'cbsa'),
  ('Harrisburg-York-Lebanon, PA', 'harrisburg-york-lebanon-pa', '276', 'csa'),
  ('Harrisonburg-Staunton-Stuarts Draft, VA', 'harrisonburg-staunton-stuarts-draft-va', '277', 'csa'),
  ('Hattiesburg-Laurel, MS', 'hattiesburg-laurel-ms', '279', 'csa'),
  ('Helena, MT', 'helena-mt', '25740', 'cbsa'),
  ('Hilton Head Island-Bluffton-Port Royal, SC', 'hilton-head-island-bluffton-port-royal-sc', '25940', 'cbsa'),
  ('Homosassa Springs, FL', 'homosassa-springs-fl', '26140', 'cbsa'),
  ('Hot Springs-Malvern, AR', 'hot-springs-malvern-ar', '284', 'csa'),
  ('Houma-Bayou Cane-Thibodaux, LA', 'houma-bayou-cane-thibodaux-la', '26380', 'cbsa'),
  ('Houston-Pasadena, TX', 'houston-pasadena-tx', '288', 'csa'),
  ('Huntsville-Decatur-Albertville, AL-TN', 'huntsville-decatur-albertville-al-tn', '290', 'csa'),
  ('Idaho Falls-Rexburg-Blackfoot, ID', 'idaho-falls-rexburg-blackfoot-id', '292', 'csa'),
  ('Indianapolis-Carmel-Muncie, IN', 'indianapolis-carmel-muncie-in', '294', 'csa'),
  ('Ithaca-Cortland, NY', 'ithaca-cortland-ny', '296', 'csa'),
  ('Jackson-Vicksburg-Brookhaven, MS', 'jackson-vicksburg-brookhaven-ms', '298', 'csa'),
  ('Jackson, MI', 'jackson-mi', '27100', 'cbsa'),
  ('Jackson, TN', 'jackson-tn', '27180', 'cbsa'),
  ('Jacksonville-Kingsland-Palatka, FL-GA', 'jacksonville-kingsland-palatka-fl-ga', '300', 'csa'),
  ('Jacksonville, NC', 'jacksonville-nc', '27340', 'cbsa'),
  ('Johnson City-Kingsport-Bristol, TN-VA', 'johnson-city-kingsport-bristol-tn-va', '304', 'csa'),
  ('Johnstown-Somerset, PA', 'johnstown-somerset-pa', '306', 'csa'),
  ('Jonesboro-Paragould, AR', 'jonesboro-paragould-ar', '308', 'csa'),
  ('Joplin-Miami, MO-OK-KS', 'joplin-miami-mo-ok-ks', '309', 'csa'),
  ('Kahului-Wailuku, HI', 'kahului-wailuku-hi', '27980', 'cbsa'),
  ('Kalamazoo-Battle Creek-Portage, MI', 'kalamazoo-battle-creek-portage-mi', '310', 'csa'),
  ('Kansas City-Overland Park-Kansas City, MO-KS', 'kansas-city-overland-park-kansas-city-mo-ks', '312', 'csa'),
  ('Keene-Brattleboro, NH-VT', 'keene-brattleboro-nh-vt', '313', 'csa'),
  ('Kennewick-Richland-Walla Walla, WA', 'kennewick-richland-walla-walla-wa', '314', 'csa'),
  ('Killeen-Temple, TX', 'killeen-temple-tx', '28660', 'cbsa'),
  ('Knoxville-Morristown-Sevierville, TN', 'knoxville-morristown-sevierville-tn', '315', 'csa'),
  ('La Crosse-Onalaska-Sparta, WI-MN', 'la-crosse-onalaska-sparta-wi-mn', '317', 'csa'),
  ('Lafayette-New Iberia-Opelousas, LA', 'lafayette-new-iberia-opelousas-la', '318', 'csa'),
  ('Lafayette-West Lafayette-Frankfort, IN', 'lafayette-west-lafayette-frankfort-in', '320', 'csa'),
  ('Lake Charles-DeRidder, LA', 'lake-charles-deridder-la', '324', 'csa'),
  ('Lake Havasu City-Kingman, AZ', 'lake-havasu-city-kingman-az', '29420', 'cbsa'),
  ('Lancaster, PA', 'lancaster-pa', '29540', 'cbsa'),
  ('Lansing-East Lansing-Owosso, MI', 'lansing-east-lansing-owosso-mi', '330', 'csa'),
  ('Laredo, TX', 'laredo-tx', '29700', 'cbsa'),
  ('Las Vegas-Henderson, NV', 'las-vegas-henderson-nv', '332', 'csa'),
  ('Lawton-Duncan, OK', 'lawton-duncan-ok', '334', 'csa'),
  ('Lewiston, ID-WA', 'lewiston-id-wa', '30300', 'cbsa'),
  ('Lexington-Fayette--Richmond--Frankfort, KY', 'lexington-fayette-richmond-frankfort-ky', '336', 'csa'),
  ('Lima-Van Wert-Celina, OH', 'lima-van-wert-celina-oh', '338', 'csa'),
  ('Lincoln-Beatrice, NE', 'lincoln-beatrice-ne', '339', 'csa'),
  ('Little Rock-North Little Rock, AR', 'little-rock-north-little-rock-ar', '340', 'csa'),
  ('Logan, UT-ID', 'logan-ut-id', '30860', 'cbsa'),
  ('Longview, TX', 'longview-tx', '30980', 'cbsa'),
  ('Los Angeles-Long Beach, CA', 'los-angeles-long-beach-ca', '348', 'csa'),
  ('Louisville/Jefferson County--Elizabethtown, KY-IN', 'louisville-jefferson-county-elizabethtown-ky-in', '350', 'csa'),
  ('Lubbock-Plainview, TX', 'lubbock-plainview-tx', '352', 'csa'),
  ('Lynchburg, VA', 'lynchburg-va', '31340', 'cbsa'),
  ('Macon-Bibb County--Warner Robins, GA', 'macon-bibb-county-warner-robins-ga', '356', 'csa'),
  ('Madison-Janesville-Beloit, WI', 'madison-janesville-beloit-wi', '357', 'csa'),
  ('Manhattan, KS', 'manhattan-ks', '31740', 'cbsa'),
  ('Mankato-New Ulm, MN', 'mankato-new-ulm-mn', '359', 'csa'),
  ('Mansfield-Ashland-Bucyrus, OH', 'mansfield-ashland-bucyrus-oh', '360', 'csa'),
  ('Marinette-Iron Mountain, WI-MI', 'marinette-iron-mountain-wi-mi', '361', 'csa'),
  ('Mayagüez-Aguadilla, PR', 'mayag-ez-aguadilla-pr', '364', 'csa'),
  ('McAllen-Edinburg, TX', 'mcallen-edinburg-tx', '365', 'csa'),
  ('Medford-Grants Pass, OR', 'medford-grants-pass-or', '366', 'csa'),
  ('Memphis-Clarksdale-Forrest City, TN-MS-AR', 'memphis-clarksdale-forrest-city-tn-ms-ar', '368', 'csa'),
  ('Miami-Port St. Lucie-Fort Lauderdale, FL', 'miami-port-st-lucie-fort-lauderdale-fl', '370', 'csa'),
  ('Middlesborough-Corbin, KY', 'middlesborough-corbin-ky', '371', 'csa'),
  ('Midland-Odessa-Andrews, TX', 'midland-odessa-andrews-tx', '372', 'csa'),
  ('Milwaukee-Racine-Waukesha, WI', 'milwaukee-racine-waukesha-wi', '376', 'csa'),
  ('Minneapolis-St. Paul, MN-WI', 'minneapolis-st-paul-mn-wi', '378', 'csa'),
  ('Minot, ND', 'minot-nd', '33500', 'cbsa'),
  ('Missoula, MT', 'missoula-mt', '33540', 'cbsa'),
  ('Mobile-Daphne-Fairhope, AL', 'mobile-daphne-fairhope-al', '380', 'csa'),
  ('Monroe-Ruston, LA', 'monroe-ruston-la', '384', 'csa'),
  ('Montgomery-Selma, AL', 'montgomery-selma-al', '388', 'csa'),
  ('Morgantown, WV', 'morgantown-wv', '34060', 'cbsa'),
  ('Moses Lake-Othello, WA', 'moses-lake-othello-wa', '393', 'csa'),
  ('Mount Pleasant-Alma, MI', 'mount-pleasant-alma-mi', '394', 'csa'),
  ('Myrtle Beach-Conway, SC', 'myrtle-beach-conway-sc', '396', 'csa'),
  ('Nashville-Davidson--Murfreesboro, TN', 'nashville-davidson-murfreesboro-tn', '400', 'csa'),
  ('New Bern-Morehead City, NC', 'new-bern-morehead-city-nc', '404', 'csa'),
  ('New Haven-Hartford-Waterbury, CT', 'new-haven-hartford-waterbury-ct', '405', 'csa'),
  ('New Orleans-Metairie-Slidell, LA-MS', 'new-orleans-metairie-slidell-la-ms', '406', 'csa'),
  ('New York-Newark, NY-NJ-CT-PA', 'new-york-newark-ny-nj-ct-pa', '408', 'csa'),
  ('North Port-Bradenton, FL', 'north-port-bradenton-fl', '412', 'csa'),
  ('Ocala, FL', 'ocala-fl', '36100', 'cbsa'),
  ('Oklahoma City-Shawnee, OK', 'oklahoma-city-shawnee-ok', '416', 'csa'),
  ('Omaha-Fremont, NE-IA', 'omaha-fremont-ne-ia', '420', 'csa'),
  ('Orlando-Lakeland-Deltona, FL', 'orlando-lakeland-deltona-fl', '422', 'csa'),
  ('Owensboro, KY', 'owensboro-ky', '36980', 'cbsa'),
  ('Paducah-Mayfield, KY-IL', 'paducah-mayfield-ky-il', '424', 'csa'),
  ('Palm Bay-Melbourne-Titusville, FL', 'palm-bay-melbourne-titusville-fl', '37340', 'cbsa'),
  ('Panama City-Panama City Beach, FL', 'panama-city-panama-city-beach-fl', '37460', 'cbsa'),
  ('Parkersburg-Marietta-Vienna, WV-OH', 'parkersburg-marietta-vienna-wv-oh', '425', 'csa'),
  ('Pensacola-Ferry Pass-Brent, FL', 'pensacola-ferry-pass-brent-fl', '37860', 'cbsa'),
  ('Peoria-Canton, IL', 'peoria-canton-il', '427', 'csa'),
  ('Philadelphia-Reading-Camden, PA-NJ-DE-MD', 'philadelphia-reading-camden-pa-nj-de-md', '428', 'csa'),
  ('Phoenix-Mesa, AZ', 'phoenix-mesa-az', '429', 'csa'),
  ('Pittsburgh-Weirton-Steubenville, PA-OH-WV', 'pittsburgh-weirton-steubenville-pa-oh-wv', '430', 'csa'),
  ('Pittsfield, MA', 'pittsfield-ma', '38340', 'cbsa'),
  ('Pocatello, ID', 'pocatello-id', '38540', 'cbsa'),
  ('Ponce-Coamo, PR', 'ponce-coamo-pr', '434', 'csa'),
  ('Portland-Lewiston-South Portland, ME', 'portland-lewiston-south-portland-me', '438', 'csa'),
  ('Portland-Vancouver-Salem, OR-WA', 'portland-vancouver-salem-or-wa', '440', 'csa'),
  ('Prescott Valley-Prescott, AZ', 'prescott-valley-prescott-az', '39150', 'cbsa'),
  ('Pueblo-Cañon City, CO', 'pueblo-ca-on-city-co', '444', 'csa'),
  ('Pullman-Moscow, WA-ID', 'pullman-moscow-wa-id', '446', 'csa'),
  ('Quincy-Hannibal, IL-MO', 'quincy-hannibal-il-mo', '448', 'csa'),
  ('Raleigh-Durham-Cary, NC', 'raleigh-durham-cary-nc', '450', 'csa'),
  ('Rapid City-Spearfish, SD', 'rapid-city-spearfish-sd', '452', 'csa'),
  ('Redding-Red Bluff, CA', 'redding-red-bluff-ca', '454', 'csa'),
  ('Reno-Carson City-Gardnerville Ranchos, NV-CA', 'reno-carson-city-gardnerville-ranchos-nv-ca', '456', 'csa'),
  ('Richmond-Connersville, IN', 'richmond-connersville-in', '458', 'csa'),
  ('Richmond, VA', 'richmond-va', '40060', 'cbsa'),
  ('Roanoke, VA', 'roanoke-va', '40220', 'cbsa'),
  ('Rochester-Austin-Winona, MN', 'rochester-austin-winona-mn', '462', 'csa'),
  ('Rochester-Batavia-Seneca Falls, NY', 'rochester-batavia-seneca-falls-ny', '464', 'csa'),
  ('Rockford-Freeport-Rochelle, IL', 'rockford-freeport-rochelle-il', '466', 'csa'),
  ('Rocky Mount-Wilson-Roanoke Rapids, NC', 'rocky-mount-wilson-roanoke-rapids-nc', '468', 'csa'),
  ('Sacramento-Roseville, CA', 'sacramento-roseville-ca', '472', 'csa'),
  ('Saginaw-Midland-Bay City, MI', 'saginaw-midland-bay-city-mi', '474', 'csa'),
  ('Salinas, CA', 'salinas-ca', '41500', 'cbsa'),
  ('Salisbury-Ocean Pines, MD', 'salisbury-ocean-pines-md', '480', 'csa'),
  ('Salt Lake City-Provo-Orem, UT-ID', 'salt-lake-city-provo-orem-ut-id', '482', 'csa'),
  ('San Angelo, TX', 'san-angelo-tx', '41660', 'cbsa'),
  ('San Antonio-New Braunfels-Kerrville, TX', 'san-antonio-new-braunfels-kerrville-tx', '484', 'csa'),
  ('San Diego-Chula Vista-Carlsbad, CA', 'san-diego-chula-vista-carlsbad-ca', '41740', 'cbsa'),
  ('San Jose-San Francisco-Oakland, CA', 'san-jose-san-francisco-oakland-ca', '488', 'csa'),
  ('San Juan-Bayamón, PR', 'san-juan-bayam-n-pr', '490', 'csa'),
  ('San Luis Obispo-Paso Robles, CA', 'san-luis-obispo-paso-robles-ca', '42020', 'cbsa'),
  ('Santa Maria-Santa Barbara, CA', 'santa-maria-santa-barbara-ca', '42200', 'cbsa'),
  ('Santa Rosa-Petaluma, CA', 'santa-rosa-petaluma-ca', '42220', 'cbsa'),
  ('Savannah-Hinesville-Statesboro, GA', 'savannah-hinesville-statesboro-ga', '496', 'csa'),
  ('Scranton--Wilkes-Barre, PA', 'scranton-wilkes-barre-pa', '42540', 'cbsa'),
  ('Seattle-Tacoma, WA', 'seattle-tacoma-wa', '500', 'csa'),
  ('Sebring, FL', 'sebring-fl', '42700', 'cbsa'),
  ('Sheboygan, WI', 'sheboygan-wi', '43100', 'cbsa'),
  ('Shreveport-Bossier City-Minden, LA', 'shreveport-bossier-city-minden-la', '508', 'csa'),
  ('Sierra Vista-Douglas, AZ', 'sierra-vista-douglas-az', '43420', 'cbsa'),
  ('Sioux City-Le Mars, IA-NE-SD', 'sioux-city-le-mars-ia-ne-sd', '512', 'csa'),
  ('Sioux Falls, SD-MN', 'sioux-falls-sd-mn', '43620', 'cbsa'),
  ('South Bend-Elkhart-Mishawaka, IN-MI', 'south-bend-elkhart-mishawaka-in-mi', '515', 'csa'),
  ('Spencer-Spirit Lake, IA', 'spencer-spirit-lake-ia', '517', 'csa'),
  ('Spokane-Spokane Valley-Coeur d''Alene, WA-ID', 'spokane-spokane-valley-coeur-d-alene-wa-id', '518', 'csa'),
  ('Springfield-Amherst Town-Northampton, MA', 'springfield-amherst-town-northampton-ma', '521', 'csa'),
  ('Springfield-Jacksonville-Lincoln, IL', 'springfield-jacksonville-lincoln-il', '522', 'csa'),
  ('Springfield, MO', 'springfield-mo', '44180', 'cbsa'),
  ('St. George, UT', 'st-george-ut', '41100', 'cbsa'),
  ('St. Louis-St. Charles-Farmington, MO-IL', 'st-louis-st-charles-farmington-mo-il', '476', 'csa'),
  ('Starkville-Columbus, MS', 'starkville-columbus-ms', '523', 'csa'),
  ('State College-DuBois, PA', 'state-college-dubois-pa', '524', 'csa'),
  ('Syracuse-Auburn, NY', 'syracuse-auburn-ny', '532', 'csa'),
  ('Tallahassee-Bainbridge, FL-GA', 'tallahassee-bainbridge-fl-ga', '533', 'csa'),
  ('Tampa-St. Petersburg-Clearwater, FL', 'tampa-st-petersburg-clearwater-fl', '45300', 'cbsa'),
  ('Terre Haute, IN', 'terre-haute-in', '45460', 'cbsa'),
  ('Texarkana, TX-AR', 'texarkana-tx-ar', '45500', 'cbsa'),
  ('Toledo, OH', 'toledo-oh', '45780', 'cbsa'),
  ('Topeka, KS', 'topeka-ks', '45820', 'cbsa'),
  ('Traverse City, MI', 'traverse-city-mi', '45900', 'cbsa'),
  ('Tucson-Nogales, AZ', 'tucson-nogales-az', '536', 'csa'),
  ('Tulsa-Bartlesville-Muskogee, OK', 'tulsa-bartlesville-muskogee-ok', '538', 'csa'),
  ('Tupelo-Corinth, MS', 'tupelo-corinth-ms', '539', 'csa'),
  ('Tuscaloosa, AL', 'tuscaloosa-al', '46220', 'cbsa'),
  ('Twin Falls, ID', 'twin-falls-id', '46300', 'cbsa'),
  ('Tyler-Jacksonville, TX', 'tyler-jacksonville-tx', '540', 'csa'),
  ('Union City-Martin, TN', 'union-city-martin-tn', '542', 'csa'),
  ('Urban Honolulu, HI', 'urban-honolulu-hi', '46520', 'cbsa'),
  ('Utica-Rome, NY', 'utica-rome-ny', '46540', 'cbsa'),
  ('Valdosta, GA', 'valdosta-ga', '46660', 'cbsa'),
  ('Victoria-Port Lavaca, TX', 'victoria-port-lavaca-tx', '544', 'csa'),
  ('Virginia Beach-Chesapeake, VA-NC', 'virginia-beach-chesapeake-va-nc', '545', 'csa'),
  ('Visalia, CA', 'visalia-ca', '47300', 'cbsa'),
  ('Waco, TX', 'waco-tx', '47380', 'cbsa'),
  ('Washington-Baltimore-Arlington, DC-MD-VA-WV-PA', 'washington-baltimore-arlington-dc-md-va-wv-pa', '548', 'csa'),
  ('Waterloo-Cedar Falls, IA', 'waterloo-cedar-falls-ia', '47940', 'cbsa'),
  ('Watertown-Fort Drum, NY', 'watertown-fort-drum-ny', '48060', 'cbsa'),
  ('Wausau-Stevens Point-Wisconsin Rapids, WI', 'wausau-stevens-point-wisconsin-rapids-wi', '554', 'csa'),
  ('Weatherford-Elk City, OK', 'weatherford-elk-city-ok', '555', 'csa'),
  ('Wenatchee-East Wenatchee, WA', 'wenatchee-east-wenatchee-wa', '48300', 'cbsa'),
  ('Wheeling, WV-OH', 'wheeling-wv-oh', '48540', 'cbsa'),
  ('Wichita Falls, TX', 'wichita-falls-tx', '48660', 'cbsa'),
  ('Wichita-Arkansas City-Winfield, KS', 'wichita-arkansas-city-winfield-ks', '556', 'csa'),
  ('Williamsport-Lock Haven, PA', 'williamsport-lock-haven-pa', '558', 'csa'),
  ('Wilmington, NC', 'wilmington-nc', '48900', 'cbsa'),
  ('Yakima, WA', 'yakima-wa', '49420', 'cbsa'),
  ('Youngstown-Warren-Salem, OH', 'youngstown-warren-salem-oh', '566', 'csa'),
  ('Yuma, AZ', 'yuma-az', '49740', 'cbsa')
on conflict (slug) do nothing;
