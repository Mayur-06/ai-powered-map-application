import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
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

// Bounding box for Greater Noida
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

const contact = process.env.OVERPASS_CONTACT?.trim();
const USER_AGENT = contact
  ? `GreaterNoidaMapSeed/1.0 (${contact})`
  : 'GreaterNoidaMapSeed/1.0';

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

function resolvePoiName(tags: Record<string, string>, category: string): string | null {
  const rawName = tags.name?.trim();
  if (rawName) return rawName;

  // For bank_atm and pharmacy ONLY: fallback to brand, operator, name:en
  if (category === 'bank_atm' || category === 'pharmacy') {
    const base = tags.brand?.trim() || tags.operator?.trim() || tags['name:en']?.trim() || null;
    if (!base) return null;

    if (category === 'bank_atm') {
      const isAtm = tags.amenity === 'atm' || tags.atm === 'yes';
      if (isAtm && !/\batm\b/i.test(base)) {
        return `${base} ATM`;
      }
      if (!isAtm && !/\bbank\b/i.test(base) && !/\batm\b/i.test(base)) {
        return `${base} Bank`;
      }
      return base;
    }

    if (category === 'pharmacy') {
      if (!/\b(pharmacy|chemist|medicos|medical)\b/i.test(base)) {
        return `${base} Pharmacy`;
      }
      return base;
    }
  }

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
  node["amenity"~"^(cafe|restaurant|fast_food|food_court|pharmacy|bank|atm|fuel|hospital|clinic|doctors)$"](${bboxStr});
  way["amenity"~"^(cafe|restaurant|fast_food|food_court|pharmacy|bank|atm|fuel|hospital|clinic|doctors)$"](${bboxStr});
  node["shop"~"^(supermarket|mall|convenience|department_store|chemist|general|bakery)$"](${bboxStr});
  way["shop"~"^(supermarket|mall|convenience|department_store|chemist|general|bakery)$"](${bboxStr});
  node["healthcare"~"^(pharmacy|hospital|clinic)$"](${bboxStr});
  way["healthcare"~"^(pharmacy|hospital|clinic)$"](${bboxStr});
  node["atm"="yes"](${bboxStr});
  way["atm"="yes"](${bboxStr});
  node["leisure"~"^(park|garden)$"](${bboxStr});
  way["leisure"~"^(park|garden)$"](${bboxStr});
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
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return await tryFetch(primaryEndpoint);
  }
}

function loadManualPois(): PoiRow[] {
  const filePath = path.resolve(process.cwd(), 'data/manual-pois.json');
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    if (!rawContent.trim()) {
      return [];
    }

    const manualPoiSchema = z.array(
      z.object({
        name: z.string().min(1),
        category: z.enum([
          'cafe',
          'restaurant',
          'pharmacy',
          'bank_atm',
          'fuel',
          'park',
          'hospital',
          'shopping',
        ]),
        lng: z.number(),
        lat: z.number(),
        address: z.string().optional(),
      })
    );

    const json = JSON.parse(rawContent);
    const parsed = manualPoiSchema.parse(json);

    const slugify = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    return parsed.map((p, index) => {
      const slug = slugify(p.name) || 'poi';
      return {
        osm_id: `manual/${slug}-${index}`,
        name: p.name.trim(),
        category: p.category,
        description: null,
        geom: `SRID=4326;POINT(${p.lng} ${p.lat})`,
        address: p.address?.trim() ?? null,
        rating: null,
        price_level: null,
        hours: null,
        embedding: null,
        summary: null,
      };
    });
  } catch (err) {
    console.warn(`Warning: Could not parse data/manual-pois.json: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export function parseElementsToPois(elements: OverpassElement[]): {
  pois: PoiRow[];
  diagnostics: Record<string, { withName: number; withoutName: number }>;
} {
  const seenOsmIds = new Set<string>();
  const pois: PoiRow[] = [];

  const diagnostics: Record<string, { withName: number; withoutName: number }> = {
    cafe: { withName: 0, withoutName: 0 },
    restaurant: { withName: 0, withoutName: 0 },
    pharmacy: { withName: 0, withoutName: 0 },
    bank_atm: { withName: 0, withoutName: 0 },
    fuel: { withName: 0, withoutName: 0 },
    park: { withName: 0, withoutName: 0 },
    hospital: { withName: 0, withoutName: 0 },
    shopping: { withName: 0, withoutName: 0 },
  };

  for (const el of elements) {
    if (!el.tags) continue;

    const category = mapCategory(el.tags);
    if (!category) continue;

    // Diagnostic tracking BEFORE name filter
    const hasExplicitName = Boolean(el.tags.name?.trim());
    if (diagnostics[category]) {
      if (hasExplicitName) {
        diagnostics[category].withName++;
      } else {
        diagnostics[category].withoutName++;
      }
    }

    const resolvedName = resolvePoiName(el.tags, category);
    if (!resolvedName) continue;

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
      name: resolvedName,
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

  return { pois, diagnostics };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isManualOnly = process.argv.includes('--manual-only');

  console.log(`Starting POI seed script for Greater Noida.`);
  if (!isManualOnly) {
    console.log(`Bounding Box: south=${BBOX.south}, west=${BBOX.west}, north=${BBOX.north}, east=${BBOX.east}`);
    console.log(`User-Agent: ${USER_AGENT}`);
  }
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (read-only, no database writes)' : 'LIVE SEED'}${isManualOnly ? ' (MANUAL-ONLY)' : ''}`);

  let osmPois: PoiRow[] = [];
  if (!isManualOnly) {
    const query = buildOverpassQuery(BBOX);
    const data = await fetchOverpassWithRetry(query);
    const parsed = parseElementsToPois(data.elements || []);
    osmPois = parsed.pois;
    const diagnostics = parsed.diagnostics;

    // Diagnostic report before name filtering
    console.log('\n--- Raw Element Counts Before Name Filter ---');
    console.log('Category'.padEnd(14) + 'With Name'.padStart(12) + 'Without Name'.padStart(15) + 'Total Raw'.padStart(12));
    console.log('-'.repeat(53));
    let totalWith = 0;
    let totalWithout = 0;
    for (const [cat, counts] of Object.entries(diagnostics)) {
      const rawTotal = counts.withName + counts.withoutName;
      totalWith += counts.withName;
      totalWithout += counts.withoutName;
      console.log(
        cat.padEnd(14) +
        String(counts.withName).padStart(12) +
        String(counts.withoutName).padStart(15) +
        String(rawTotal).padStart(12)
      );
    }
    console.log('-'.repeat(53));
    console.log(
      'Total'.padEnd(14) +
      String(totalWith).padStart(12) +
      String(totalWithout).padStart(15) +
      String(totalWith + totalWithout).padStart(12)
    );
  }

  const manualPois = loadManualPois();
  if (manualPois.length > 0) {
    console.log(`\nLoaded ${manualPois.length} manual POIs from data/manual-pois.json`);
  }

  const allPois = [...osmPois, ...manualPois];

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

  for (const poi of allPois) {
    if (categoryCounts[poi.category] !== undefined) {
      categoryCounts[poi.category]++;
    }
  }

  console.log('\n--- Valid POI Category Counts (Post Name-Filter & Fallbacks + Manual) ---');
  for (const [cat, count] of Object.entries(categoryCounts)) {
    console.log(`  ${cat.padEnd(12)}: ${count}`);
  }
  console.log(`Total valid POIs: ${allPois.length}`);

  if (isDryRun) {
    console.log('\n--- 5 Sample Rows (Dry Run, prioritizing bank_atm and pharmacy) ---');
    const bankAtmSample = allPois.find((p) => p.category === 'bank_atm');
    const pharmacySample = allPois.find((p) => p.category === 'pharmacy');
    const priority = [bankAtmSample, pharmacySample].filter((p): p is PoiRow => Boolean(p));
    const others = allPois.filter((p) => !priority.includes(p)).slice(0, 5 - priority.length);
    const samples = [...priority, ...others];

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

  for (let i = 0; i < allPois.length; i += batchSize) {
    const batch = allPois.slice(i, i + batchSize);
    const { error } = await supabase
      .from('pois')
      .upsert(batch, { onConflict: 'osm_id' });

    if (error) {
      throw new Error(`Failed to upsert batch starting at index ${i}: ${error.message}`);
    }

    insertedTotal += batch.length;
    console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} rows (Progress: ${insertedTotal}/${allPois.length})`);
  }

  console.log(`\n[Live Seed Complete] Successfully upserted ${insertedTotal} POIs into the 'pois' table.`);
}

if (process.argv[1]?.includes('seed-pois')) {
  main().catch((err) => {
    console.error('\nSeed script error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
