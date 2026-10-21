-- Pro profile customization: { frame, theme, title, number }.
alter table public.profiles add column if not exists style jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_style_size;
alter table public.profiles add constraint profiles_style_size check (pg_column_size(style) < 2048);
