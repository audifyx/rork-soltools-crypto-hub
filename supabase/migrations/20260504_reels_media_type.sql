-- Allow reels to be either image or video posts.

alter table public.reels
  add column if not exists media_type text not null default 'video';

alter table public.reels
  drop constraint if exists reels_media_type_check;

alter table public.reels
  add constraint reels_media_type_check check (media_type in ('video','image'));

-- Expand the storage bucket to accept image mimetypes alongside video.
update storage.buckets
set allowed_mime_types = array[
  'video/mp4','video/quicktime','video/webm','video/x-m4v',
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'
]::text[]
where id = 'reel-media';
