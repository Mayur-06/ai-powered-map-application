import { createServerClient } from '../lib/supabase/server';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export interface PoiRow {
  osm_id: string;
  name: string;
  category: string;
  description: string | null;
  geom: string;
  address: string | null;
  rating: number | null;
  price_level: number | null;
  hours: { raw: string } | null;
  embedding: null;
  summary: null;
}

// Bounding box for Greater Noida (confirmed wider bbox)
// south, west, north, east
const BBOX = {
  south: 28.380,
  west: 77.400,
  north: 28.600,
  east: 77.580,
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const USER_AGENT = 'GreaterNoidaMapSeed/1.0 (https://github.com/Mayur-06/ai-powered-map-application; mayur06dt@gmail.com)';

function mapCategory(tags: Record<string, string>): string | null {
  const amenity = tags.amenity;
  const shop = tags.shop;
  const leisure = tags.leisure;
  const healthcare = tags.healthcare;

  // Pharmacy: amenity=pharmacy, shop=chemist, healthcare=pharmacy
  if (
    amenity === 'pharmacy' ||
    shop === 'chemist' ||
    healthcare === 'pharmacy'
  ) {
    return 'pharmacy';
  }

  // Cafe
  if (amenity === 'cafe') return 'cafe';

  // Restaurant: fast_food and food_court map to restaurant, not cafe
  if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'food_court') {
    return 'restaurant';
  }

  // Bank & ATM
  if (amenity === 'bank' || amenity === 'atm' || tags.atm === 'yes') {
    return 'bank_atm';
  }

  // Fuel
  if (amenity === 'fuel') return 'fuel';

  // Hospital & clinics
  if (
    amenity === 'hospital' ||
    amenity === 'clinic' ||
    amenity === 'doctors' ||
    healthcare === 'hospital' ||
    healthcare === 'clinic'
  ) {
    return 'hospital';
  }

  // Shopping
  if (
    [
      'supermarket',
      'mall',
      'convenience',
      'department_store',
      'general',
      'bakery',
    ].includes(shop)
  ) {
    return 'shopping';
  }

  // Park
  if (leisure === 'park' || leisure === 'garden') return 'park';

  return null;
}

function extractAddress(tags: Record<string, string>): string | null {
  if (tags['addr:full'] && tags['addr:full'].trim()) {
    return tags['addr:full'].trim();
  }

  const parts: string[] = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber'].trim());
  if (tags['addr:street']) parts.push(tags['addr:street'].trim());
  if (tags['addr:suburb']) parts.push(tags['addr:suburb'].trim());
  else if (tags['addr:neighbourhood']) parts.push(tags['addr:neighbourhood'].trim());
  if (tags['addr:city']) parts.push(tags['addr:city'].trim());
  if (tags['addr:postcode']) parts.push(tags['addr:postcode'].trim());

  if (parts.length > 0) {
    return parts.join(', ');
  }

  const otherAddr = Object.entries(tags)
    .filter(([key, val]) => key.startsWith('addr:') && key !== 'addr:country' && val && val.trim())
    .map(([, val]) => val.trim());

  if (otherAddr.length > 0) {
    return otherAddr.join(', ');
  }

  return null;
}

function buildOverpassQuery(bbox: typeof BBOX): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:60];
(
  node["amenity"~"^(cafe|restaurant|fast_food|food_court|pharmacy|bank|atm|fuel|hospital|clinic|doctors)$"]["name"](${bboxStr});
  way["amenity"~"^(cafe|restaurant|fast_food|food_court|pharmacy|bank|atm|fuel|hospital|clinic|doctors)$"]["name"](${bboxStr});
  node["shop"~"^(supermarket|mall|convenience|department_store|chemist|general|bakery)$"]["name"](${bboxStr});
  way["shop"~"^(supermarket|mall|convenience|department_store|chemist|general|bakery)$"]["name"](${bboxStr});
  node["healthcare"~"^(pharmacy|hospital|clinic)$"]["name"](${bboxStr});
  way["healthcare"~"^(pharmacy|hospital|clinic)$"]["name"](${bboxStr});
  node["atm"="yes"]["name"](${bboxStr});
  way["atm"="yes"]["name"](${bboxStr});
  node["leisure"~"^(park|garden)$"]["name"](${bboxStr});
  way["leisure"~"^(park|garden)$"]["name"](${bboxStr});
);
out center;`;
}

async function fetchOverpassWithRetry(query: string, timeoutMs = 60000): Promise<OverpassResponse> {
  const tryFetch = async (url: string): Promise<OverpassResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          'Referer': 'https://github.com/Mayur-06/ai-powered-map-application',
          'Accept': 'application/json',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as OverpassResponse;
      return json;
    } finally {
      clearTimeout(timer);
    }
  };

  const primaryEndpoint = OVERPASS_ENDPOINTS[0];
  try {
    console.log(`Querying Overpass API at ${primaryEndpoint}...`);
    return await tryFetch(primaryEndpoint);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`Primary Overpass request failed (${errorMsg}). Retrying once after 5s backoff...`);
    // Wait 5 seconds before retry
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return await tryFetch(primaryEndpoint);
  }
}

export function parseElementsToPois(elements: OverpassElement[]): PoiRow[] {
  const seenOsmIds = new Set<string>();
  const pois: PoiRow[] = [];

  for (const el of elements) {
    if (!el.tags || !el.tags.name) continue;

    const name = el.tags.name.trim();
    if (!name) continue;

    const category = mapCategory(el.tags);
    if (!category) continue;

    let lat: number | undefined;
    let lng: number | undefined;

    if (el.type === 'node') {
      lat = el.lat;
      lng = el.lon;
    } else if (el.center) {
      lat = el.center.lat;
      lng = el.center.lon;
    }

    if (lat === undefined || lng === undefined) continue;

    const osmId = `${el.type}/${el.id}`;
    if (seenOsmIds.has(osmId)) continue;
    seenOsmIds.add(osmId);

    const address = extractAddress(el.tags);
    const hours = el.tags.opening_hours ? { raw: el.tags.opening_hours.trim() } : null;

    pois.push({
      osm_id: osmId,
      name,
      category,
      description: null,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      address,
      rating: null,
      price_level: null,
      hours,
      embedding: null,
      summary: null,
    });
  }

  return pois;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`Starting POI seed script for Greater Noida.`);
  console.log(`Bounding Box: south=${BBOX.south}, west=${BBOX.west}, north=${BBOX.north}, east=${BBOX.east}`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (read-only, no database writes)' : 'LIVE SEED'}`);

  const query = buildOverpassQuery(BBOX);
  const data = await fetchOverpassWithRetry(query);
  const pois = parseElementsToPois(data.elements || []);

  const categoryCounts: Record<string, number> = {
    cafe: 0,
    restaurant: 0,
    pharmacy: 0,
    bank_atm: 0,
    fuel: 0,
    park: 0,
    hospital: 0,
    shopping: 0,
  };

  for (const poi of pois) {
    if (categoryCounts[poi.category] !== undefined) {
      categoryCounts[poi.category]++;
    }
  }

  console.log('\n--- POI Category Counts ---');
  for (const [cat, count] of Object.entries(categoryCounts)) {
    console.log(`  ${cat.padEnd(12)}: ${count}`);
  }
  console.log(`Total valid POIs: ${pois.length}`);

  if (isDryRun) {
    console.log('\n--- 5 Sample Rows (Dry Run, including Pharmacy if available) ---');
    // Ensure we include at least one pharmacy in samples if available
    const pharmacyPoi = pois.find((p) => p.category === 'pharmacy');
    const otherSamples = pois.filter((p) => p !== pharmacyPoi).slice(0, pharmacyPoi ? 4 : 5);
    const samples = pharmacyPoi ? [pharmacyPoi, ...otherSamples] : otherSamples;

    samples.forEach((sample, i) => {
      console.log(`\nSample #${i + 1} (${sample.category}):`);
      console.log(JSON.stringify(sample, null, 2));
    });
    console.log('\n[Dry Run Complete] No records were written to the database.');
    return;
  }

  console.log('\nConnecting to Supabase to insert POIs...');
  const supabase = createServerClient();
  const batchSize = 100;
  let insertedTotal = 0;

  for (let i = 0; i < pois.length; i += batchSize) {
    const batch = pois.slice(i, i + batchSize);
    const { error } = await supabase
      .from('pois')
      .upsert(batch, { onConflict: 'osm_id' });

    if (error) {
      throw new Error(`Failed to upsert batch starting at index ${i}: ${error.message}`);
    }

    insertedTotal += batch.length;
    console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} rows (Progress: ${insertedTotal}/${pois.length})`);
  }

  console.log(`\n[Live Seed Complete] Successfully upserted ${insertedTotal} POIs into the 'pois' table.`);
}

if (process.argv[1]?.includes('seed-pois')) {
  main().catch((err) => {
    console.error('\nSeed script error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
