-- #787 (Don, 2026-10-16): seeding reaches 45–60 minutes out from Elk Grove, Davis, Lincoln, Auburn, El Dorado
-- Hills, Sacramento, Folsom and Roseville. Stockton (38.0°N edge, centroid 37.96) sat just outside the
-- Explore metro's box, so a Page there could not load. Pull the south edge to 37.85. Only the shape moves:
-- the centroid (where the map opens) and the ZIP crosswalk behind the Local badge are untouched.
update public.metro_polygons
   set geography = ST_GeomFromText('POLYGON((-122.5 37.85, -119.85 37.85, -119.85 39.65, -122.5 39.65, -122.5 37.85))', 4326)::geography,
       updated_at = now()
 where slug = 'sacramento-roseville-ca';
