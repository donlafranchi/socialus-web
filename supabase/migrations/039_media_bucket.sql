-- T120 — Image storage substrate and the upload primitive.
-- Spec:   product/foundation/policy.md § Uploaded images (both absolutes
--         Ratified 2026-09-07) · product/systems/groups.md § A photo, or
--         art that admits it isn't one.
-- Ticket: development/tickets/T120-image-storage-substrate-and-upload-primitive.md
--
-- One bucket, `media`, for the whole platform's image uploads. Pages
-- (F061) are the first consumer; Items are a deferred second. Named
-- `media` rather than `item-media` for exactly that reason — a bucket
-- that outlives any one caller should not be named after its first one
-- (F061 review binding note 1).
--
-- Public read (a feed renders many images per screen; re-signing per
-- render isn't viable against a materialized view that stores a URL
-- string), authenticated write, and every write scoped to the uploader's
-- own member-id path segment via storage.foldername(name). The
-- member-id-first path is what makes that policy expressible.
--
-- allowed_mime_types restricts the bucket to image/webp only — the
-- client-side canvas re-encode is the only way in, and it is also what
-- strips embedded metadata (EXIF/GPS) before the object is ever stored.

------------------------------------------------------------
-- 1. The bucket
------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/webp'])
on conflict (id) do nothing;

------------------------------------------------------------
-- 2. Policies on storage.objects, scoped to bucket_id = 'media'
------------------------------------------------------------

create policy "media public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'media');

create policy "media authenticated insert own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media authenticated update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media authenticated delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
