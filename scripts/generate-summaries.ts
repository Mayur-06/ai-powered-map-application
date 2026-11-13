import { generateObject } from 'ai';
import { z } from 'zod';
import { model } from '../lib/ai/model';
import { createServerClient } from '../lib/supabase/server';

interface PoiCandidate {
  id: string;
  name: string;
  category: string;
  summary: unknown;
}

const summaryItemSchema = z.object({
  pros: z.array(z.string()).max(3).describe('Up to 3 positive points based strictly on the reviews'),
  cons: z.array(z.string()).max(3).describe('Up to 3 drawbacks or constructive points based strictly on the reviews'),
  bestFor: z.array(z.string()).max(3).describe('Up to 3 situations or groups this place is best for'),
  vibe: z.string().describe('Short vibe description (maximum 12 words)'),
  sentimentScore: z.number().min(0).max(1).describe('Sentiment score between 0.0 and 1.0'),
});

const summariesBatchSchema = z.object({
  pois: z.array(
    z.object({
      poi_id: z.string().describe('The matching POI id from the prompt'),
      summary: summaryItemSchema,
    })
  ).describe('List of POIs with structured review summaries'),
});

function parseArgs() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
    } else if (args[i].startsWith('--limit=')) {
      limit = parseInt(args[i].split('=')[1], 10);
    }
  }

  return { isDryRun, limit };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 4,
  baseDelayMs = 2000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      const errorObj = err as { status?: number; statusCode?: number; message?: string };
      const status = errorObj.status ?? errorObj.statusCode;
      const message = errorObj.message || '';

      const isRateLimit = status === 429 || /429|resource_exhausted|quota|rate limit/i.test(message);
      const isServerError =
        (typeof status === 'number' && status >= 500 && status < 600) ||
        /5\d{2}|internal server error|service unavailable/i.test(message);

      if ((isRateLimit || isServerError) && attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[Retry ${attempt}/${maxRetries}] LLM call failed (${isRateLimit ? 'Rate limit / 429' : 'Server error / 5xx'}). Waiting ${delay}ms before retrying...`
        );
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }
}

async function main() {
  const { isDryRun, limit } = parseArgs();
  const pauseMs = process.env.LLM_PAUSE_MS ? parseInt(process.env.LLM_PAUSE_MS, 10) : 5000;

  console.log(`Starting POI review summary generation.`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (calls model, prints output, writes nothing)' : 'LIVE GENERATION'}`);
  if (limit) console.log(`Limit: ${limit} POI(s)`);
  console.log(`Inter-call pause: ${pauseMs}ms`);

  const supabase = createServerClient();

  // 1. Fetch POIs that have NULL summary
  const { data: pois, error: poiErr } = await supabase
    .from('pois')
    .select('id, name, category, summary')
    .is('summary', null)
    .order('created_at', { ascending: true });

  if (poiErr) {
    throw new Error(`Failed to fetch POIs: ${poiErr.message}`);
  }

  // 2. Fetch existing reviews
  const { data: reviews, error: revErr } = await supabase
    .from('reviews')
    .select('poi_id, text, rating');

  if (revErr) {
    throw new Error(`Failed to fetch reviews: ${revErr.message}`);
  }

  // Group reviews by poi_id
  const reviewsByPoiId = new Map<string, string[]>();
  for (const r of reviews || []) {
    if (!r.poi_id || !r.text) continue;
    const existing = reviewsByPoiId.get(r.poi_id) || [];
    existing.push(r.text);
    reviewsByPoiId.set(r.poi_id, existing);
  }

  let eligiblePois: PoiCandidate[] = (pois || []).filter((p: PoiCandidate) => {
    const revs = reviewsByPoiId.get(p.id);
    return revs && revs.length > 0;
  });

  if (eligiblePois.length === 0) {
    console.log('No POIs found with reviews and a NULL summary in the database.');
    console.log('Please run "npm run gen:reviews" first to seed reviews before running summaries.');
    console.log('Final summary: Processed: 0, Skipped: 0, Failed: 0');
    return;
  }

  console.log(`Found ${eligiblePois.length} POI(s) with reviews and NULL summary.`);

  if (typeof limit === 'number' && limit > 0) {
    eligiblePois = eligiblePois.slice(0, limit);
    console.log(`Processing limited subset: ${eligiblePois.length} POI(s).`);
  }

  const BATCH_SIZE = 5;
  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < eligiblePois.length; i += BATCH_SIZE) {
      const batch = eligiblePois.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(eligiblePois.length / BATCH_SIZE);

      console.log(`\n--- Processing Batch ${batchNum}/${totalBatches} (${batch.length} POIs) ---`);

      const poiListText = batch
        .map((p) => {
          const revs = reviewsByPoiId.get(p.id) || [];
          const formattedReviews = revs.map((r, idx) => `    ${idx + 1}. "${r}"`).join('\n');
          return `- POI ID: ${p.id}\n  Name: "${p.name}"\n  Category: "${p.category}"\n  Reviews:\n${formattedReviews}`;
        })
        .join('\n\n');

      const prompt = `You are an expert review summarizer for local points of interest (POIs) in a demo map application.
For each POI listed below, analyze ONLY the provided reviews and produce a concise structured summary.

POIs and Reviews:
${poiListText}

Rules:
1. Grounding: Use ONLY information directly stated or clearly implied in the provided reviews. Never add outside facts, prices, hours, or assumptions.
2. For each POI summary:
   - pros: string[] (at most 3 key positive points mentioned in reviews)
   - cons: string[] (at most 3 constructive or negative points mentioned in reviews; empty array if none)
   - bestFor: string[] (at most 3 situations, activities, or visitor types this place is best suited for)
   - vibe: string (a concise atmosphere/vibe description of at most 12 words)
   - sentimentScore: number from 0.0 (completely negative) to 1.0 (completely positive)
3. Return the exact matching poi_id for each POI.`;

      const result = await callWithRetry(async () => {
        return await generateObject({
          model,
          schema: summariesBatchSchema,
          prompt,
        });
      });

      const batchMap = new Map(batch.map((p) => [p.id, p]));
      const returnedIds = new Set<string>();

      for (const item of result.object.pois) {
        returnedIds.add(item.poi_id);
        const poi = batchMap.get(item.poi_id);

        if (!poi) {
          console.warn(`[Warning] Dropping unknown poi_id returned by model: ${item.poi_id}`);
          skippedCount++;
          continue;
        }

        const summaryData = {
          pros: item.summary.pros.slice(0, 3),
          cons: item.summary.cons.slice(0, 3),
          bestFor: item.summary.bestFor.slice(0, 3),
          vibe: item.summary.vibe.trim(),
          sentimentScore: Math.round(item.summary.sentimentScore * 100) / 100,
        };

        if (isDryRun) {
          console.log(`\n[DRY RUN] POI: "${poi.name}" (${poi.category}) [ID: ${poi.id}]`);
          console.log(`  Pros: ${JSON.stringify(summaryData.pros)}`);
          console.log(`  Cons: ${JSON.stringify(summaryData.cons)}`);
          console.log(`  Best For: ${JSON.stringify(summaryData.bestFor)}`);
          console.log(`  Vibe: "${summaryData.vibe}"`);
          console.log(`  Sentiment Score: ${summaryData.sentimentScore}`);
          processedCount++;
        } else {
          const { error: updateErr } = await supabase
            .from('pois')
            .update({ summary: summaryData })
            .eq('id', poi.id);

          if (updateErr) {
            console.error(`Failed to update summary for ${poi.name}: ${updateErr.message}`);
            failedCount++;
            continue;
          }

          console.log(`Saved summary for "${poi.name}"`);
          processedCount++;
        }
      }

      // Check for omitted POIs
      for (const p of batch) {
        if (!returnedIds.has(p.id)) {
          console.warn(`[Warning] Model omitted POI in response: ${p.id} ("${p.name}")`);
          skippedCount++;
        }
      }

      // Pause between calls if more batches remain
      if (i + BATCH_SIZE < eligiblePois.length) {
        console.log(`Pausing ${pauseMs}ms before next call...`);
        await sleep(pauseMs);
      }
    }
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error(`\n[Fatal Error] Summarization stopped: ${errorObj.message || err}`);
    console.log('\nTo resume execution, re-run:');
    console.log('  npm run gen:summaries');
    console.log('Or to re-run with a specific limit:');
    console.log('  npm run gen:summaries -- --limit 5');
    console.log(
      `Final summary: Processed: ${processedCount}, Skipped: ${skippedCount}, Failed: ${failedCount + (eligiblePois.length - (processedCount + skippedCount))}`
    );
    process.exit(1);
  }

  console.log(`\nFinal summary: Processed: ${processedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
}

main().catch((err) => {
  console.error('\nScript failure:', err instanceof Error ? err.message : err);
  process.exit(1);
});

