-- 0002_nearby_pois.sql: Spatial lookup of POIs within a radius, optionally filtered by category.

create or replace function nearby_pois(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_category text default null
)
returns table (
  id uuid,
  name text,
  category text,
  lng double precision,
  lat double precision,
  rating numeric
)
language sql
stable
as $$
  select
    id,
    name,
    category,
    st_x(geom::geometry) as lng,
    st_y(geom::geometry) as lat,
    rating
  from pois
  where
    st_dwithin(
      geom,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
    and (p_category is null or category = p_category)
  order by
    geom <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  limit 500;
$$;

grant execute on function nearby_pois(double precision, double precision, integer, text) to anon, authenticated, service_role;
