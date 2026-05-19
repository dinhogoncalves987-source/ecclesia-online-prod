create table if not exists public.platform_announcement_media (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  media_type text not null default 'image',
  media_url text not null,
  thumbnail_url text null,
  title text null,
  description text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_announcement_media_announcement_id
  on public.platform_announcement_media (announcement_id);
