-- 0001_init.sql: Schema for AI Map Application (Greater Noida)

-- Extensions
create extension if not exists postgis;
create extension if not exists vector;

-- Table: pois
create table if not exists pois (
  id uuid primary key default gen_random_uuid(),
  osm_id text unique not null,
  name text not null,
  category text not null,
  description text,
  geom geography(Point,4326) not null,
  address text,
  rating numeric,
  price_level int,
  hours jsonb,
  embedding vector(768),
  summary jsonb,
  created_at timestamptz default now()
);

-- Table: reviews
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  poi_id uuid references pois(id) on delete cascade,
  author text,
  rating int check (rating >= 1 and rating <= 5),
  text text,
  is_sample boolean not null default true,
  created_at timestamptz default now()
);

-- Table: profiles
create table if not exists profiles (
  user_id uuid primary key,
  preferences jsonb,
  home geography(Point,4326),
  work geography(Point,4326),
  created_at timestamptz default now()
);

-- Table: saved_places
create table if not exists saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  poi_id uuid references pois(id) on delete cascade,
  note text,
  created_at timestamptz default now()
);

-- Table: trips
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  stops jsonb,
  route_geojson jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists pois_geom_idx on pois using gist (geom);
create index if not exists pois_category_idx on pois (category);
create index if not exists reviews_poi_id_idx on reviews (poi_id);

-- Row Level Security
alter table pois enable row level security;
alter table reviews enable row level security;
alter table profiles enable row level security;
alter table saved_places enable row level security;
alter table trips enable row level security;

-- Policies: allow public SELECT on pois and reviews only
create policy "Allow public read on pois"
  on pois
  for select
  using (true);

create policy "Allow public read on reviews"
  on reviews
  for select
  using (true);

