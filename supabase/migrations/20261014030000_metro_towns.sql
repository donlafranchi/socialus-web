-- #570 — the Sacramento metro's outer towns as places: everything within roughly a 45-60 minute
-- drive of Sacramento, so unclaimed Pages (and later members) can anchor to their own town instead of
-- falling back to a county. Same method as 026 (T076): towns under their county, approximate bbox
-- polygons (seed_method approx_bbox), centroid derived, one place.created event per row. No schema change.
-- Counties added: Solano, San Joaquin, Yuba, Nevada (Sacramento, Yolo, Placer, El Dorado, Sutter exist).
-- County boxes are clipped to the metro polygon so a county's centroid falls inside it.
-- Not added: Stockton (south of the metro polygon's edge), Vallejo, Jackson, Truckee (over the hour).

create temporary table _metro_towns (
  slug text not null, kind text not null, parent_slug text not null, parent_kind text not null,
  display_name text not null, wkt text not null
) on commit drop;

insert into _metro_towns (slug, kind, parent_slug, parent_kind, display_name, wkt) values
  ('solano','county','ca','state','Solano','MULTIPOLYGON(((-122.4 38.04, -121.6 38.04, -121.6 38.55, -122.4 38.55, -122.4 38.04)))'),
  ('san-joaquin','county','ca','state','San Joaquin','MULTIPOLYGON(((-121.58 38.0, -120.95 38.0, -120.95 38.3, -121.58 38.3, -121.58 38.0)))'),
  ('yuba','county','ca','state','Yuba','MULTIPOLYGON(((-121.62 39.0, -121.0 39.0, -121.0 39.6, -121.62 39.6, -121.62 39.0)))'),
  ('nevada','county','ca','state','Nevada','MULTIPOLYGON(((-121.3 39.0, -120.0 39.0, -120.0 39.6, -121.3 39.6, -121.3 39.0)))'),
  ('woodland','city','yolo','county','Woodland','MULTIPOLYGON(((-121.803 38.649, -121.743 38.649, -121.743 38.709, -121.803 38.709, -121.803 38.649)))'),
  ('winters','city','yolo','county','Winters','MULTIPOLYGON(((-122.001 38.495, -121.941 38.495, -121.941 38.555, -122.001 38.555, -122.001 38.495)))'),
  ('vacaville','city','solano','county','Vacaville','MULTIPOLYGON(((-122.018 38.327, -121.958 38.327, -121.958 38.387, -122.018 38.387, -122.018 38.327)))'),
  ('dixon','city','solano','county','Dixon','MULTIPOLYGON(((-121.853 38.415, -121.793 38.415, -121.793 38.475, -121.853 38.475, -121.853 38.415)))'),
  ('fairfield','city','solano','county','Fairfield','MULTIPOLYGON(((-122.07 38.219, -122.01 38.219, -122.01 38.279, -122.07 38.279, -122.07 38.219)))'),
  ('elk-grove','city','sacramento','county','Elk Grove','MULTIPOLYGON(((-121.402 38.379, -121.342 38.379, -121.342 38.439, -121.402 38.439, -121.402 38.379)))'),
  ('galt','city','sacramento','county','Galt','MULTIPOLYGON(((-121.33 38.224, -121.27 38.224, -121.27 38.284, -121.33 38.284, -121.33 38.224)))'),
  ('rancho-cordova','city','sacramento','county','Rancho Cordova','MULTIPOLYGON(((-121.332 38.559, -121.272 38.559, -121.272 38.619, -121.332 38.619, -121.332 38.559)))'),
  ('citrus-heights','city','sacramento','county','Citrus Heights','MULTIPOLYGON(((-121.311 38.677, -121.251 38.677, -121.251 38.737, -121.311 38.737, -121.311 38.677)))'),
  ('carmichael','city','sacramento','county','Carmichael','MULTIPOLYGON(((-121.358 38.587, -121.298 38.587, -121.298 38.647, -121.358 38.647, -121.358 38.587)))'),
  ('auburn','city','placer','county','Auburn','MULTIPOLYGON(((-121.107 38.867, -121.047 38.867, -121.047 38.927, -121.107 38.927, -121.107 38.867)))'),
  ('lincoln','city','placer','county','Lincoln','MULTIPOLYGON(((-121.324 38.861, -121.264 38.861, -121.264 38.921, -121.324 38.921, -121.324 38.861)))'),
  ('rocklin','city','placer','county','Rocklin','MULTIPOLYGON(((-121.265 38.761, -121.205 38.761, -121.205 38.821, -121.265 38.821, -121.265 38.761)))'),
  ('loomis','city','placer','county','Loomis','MULTIPOLYGON(((-121.22 38.79, -121.16 38.79, -121.16 38.85, -121.22 38.85, -121.22 38.79)))'),
  ('granite-bay','city','placer','county','Granite Bay','MULTIPOLYGON(((-121.193 38.733, -121.133 38.733, -121.133 38.793, -121.193 38.793, -121.193 38.733)))'),
  ('placerville','city','el-dorado','county','Placerville','MULTIPOLYGON(((-120.827 38.7, -120.767 38.7, -120.767 38.76, -120.827 38.76, -120.827 38.7)))'),
  ('el-dorado-hills','city','el-dorado','county','El Dorado Hills','MULTIPOLYGON(((-121.112 38.656, -121.052 38.656, -121.052 38.716, -121.112 38.716, -121.112 38.656)))'),
  ('cameron-park','city','el-dorado','county','Cameron Park','MULTIPOLYGON(((-121.02 38.639, -120.96 38.639, -120.96 38.699, -121.02 38.699, -121.02 38.639)))'),
  ('lodi','city','san-joaquin','county','Lodi','MULTIPOLYGON(((-121.302 38.104, -121.242 38.104, -121.242 38.164, -121.302 38.164, -121.302 38.104)))'),
  ('yuba-city','city','sutter','county','Yuba City','MULTIPOLYGON(((-121.647 39.11, -121.587 39.11, -121.587 39.17, -121.647 39.17, -121.647 39.11)))'),
  ('marysville','city','yuba','county','Marysville','MULTIPOLYGON(((-121.62 39.115, -121.56 39.115, -121.56 39.175, -121.62 39.175, -121.62 39.115)))'),
  ('wheatland','city','yuba','county','Wheatland','MULTIPOLYGON(((-121.453 38.982, -121.393 38.982, -121.393 39.042, -121.453 39.042, -121.453 38.982)))'),
  ('grass-valley','city','nevada','county','Grass Valley','MULTIPOLYGON(((-121.091 39.189, -121.031 39.189, -121.031 39.249, -121.091 39.249, -121.091 39.189)))'),
  ('nevada-city','city','nevada','county','Nevada City','MULTIPOLYGON(((-121.047 39.232, -120.987 39.232, -120.987 39.292, -121.047 39.292, -121.047 39.232)))');

-- Counties first, so towns in a new county find their parent.
insert into public.places (parent_id, slug, display_name, kind, geography, centroid, metadata)
select par.id, s.slug, s.display_name, s.kind, ST_GeomFromText(s.wkt, 4326)::geography,
       case when ST_Contains(ST_GeomFromText(s.wkt, 4326), ST_Centroid(ST_GeomFromText(s.wkt, 4326)))
            then ST_Centroid(ST_GeomFromText(s.wkt, 4326))::geography
            else ST_PointOnSurface(ST_GeomFromText(s.wkt, 4326))::geography end,
       jsonb_build_object('seed_method', 'approx_bbox', 'source', 'metro_towns_570')
from _metro_towns s
join public.places par
  on par.slug = s.parent_slug and par.kind = s.parent_kind and par.deleted_at is null
 and (s.parent_kind <> 'county' or par.parent_id = (select id from public.places where slug = 'ca' and kind = 'state' and deleted_at is null))
where s.kind = 'county' and not exists (
  select 1 from public.places e where e.slug = s.slug and e.kind = s.kind and e.parent_id = par.id and e.deleted_at is null
);


insert into public.places (parent_id, slug, display_name, kind, geography, centroid, metadata)
select par.id, s.slug, s.display_name, s.kind, ST_GeomFromText(s.wkt, 4326)::geography,
       case when ST_Contains(ST_GeomFromText(s.wkt, 4326), ST_Centroid(ST_GeomFromText(s.wkt, 4326)))
            then ST_Centroid(ST_GeomFromText(s.wkt, 4326))::geography
            else ST_PointOnSurface(ST_GeomFromText(s.wkt, 4326))::geography end,
       jsonb_build_object('seed_method', 'approx_bbox', 'source', 'metro_towns_570')
from _metro_towns s
join public.places par
  on par.slug = s.parent_slug and par.kind = s.parent_kind and par.deleted_at is null
 and (s.parent_kind <> 'county' or par.parent_id = (select id from public.places where slug = 'ca' and kind = 'state' and deleted_at is null))
where s.kind = 'city' and not exists (
  select 1 from public.places e where e.slug = s.slug and e.kind = s.kind and e.parent_id = par.id and e.deleted_at is null
);

select public.rotate_place_events_partitions();

insert into public.place_events (place_id, event_kind, payload, acting_member_id)
select p.id, 'place.created',
       jsonb_build_object('correlation_id', 'b7600000-0000-4000-8000-000000000570', 'source', 'metro_towns_570', 'seed_method', 'approx_bbox'),
       '00000000-0000-0000-0000-000000000001'
from _metro_towns s
join public.places p on p.slug = s.slug and p.kind = s.kind and p.deleted_at is null
where p.metadata ->> 'source' = 'metro_towns_570'
  and not exists (select 1 from public.place_events ev where ev.place_id = p.id and ev.event_kind = 'place.created');
