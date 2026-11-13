import { generateObject } from 'ai';
import { z } from 'zod';
import { model } from '../lib/ai/model';
import { createServerClient } from '../lib/supabase/server';

interface PoiCandidate {
  id: string;
  name: string;
  category: string;
}

const reviewItemSchema = z.object({
  author: z.string().describe('A common first name (e.g. Rahul, Priya, Amit, Sneha)'),
  rating: z.number().int().min(1).max(5).describe('Integer rating from 1 to 5'),
  text: z.string().describe('1 to 2 sentences of generic, plausible review text'),
});

const reviewsBatchSchema = z.object({
  pois: z.array(
    z.object({
      poi_id: z.string().describe('The matching POI id from the prompt'),
      reviews: z
        .array(reviewItemSchema)
        .min(4)
        .max(6)
        .describe('4 to 6 realistic reviews for this POI'),
    })
  ).describe('List of POIs with generated sample reviews'),
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

  console.log(`Starting POI sample review generation.`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (calls model, prints output, writes nothing)' : 'LIVE GENERATION'}`);
  if (limit) console.log(`Limit: ${limit} POI(s)`);
  console.log(`Inter-call pause: ${pauseMs}ms`);

  const supabase = createServerClient();

  // 1. Fetch POIs that already have reviews
  const { data: existingReviews, error: revErr } = await supabase
    .from('reviews')
    .select('poi_id');

  if (revErr) {
    throw new Error(`Failed to check existing reviews: ${revErr.message}`);
  }

  const reviewedPoiIds = new Set(
    (existingReviews || []).map((r: { poi_id: string }) => r.poi_id).filter(Boolean)
  );

  // 2. Fetch POIs with no rows in reviews
  const { data: allPois, error: poiErr } = await supabase
    .from('pois')
    .select('id, name, category')
    .order('created_at', { ascending: true });

  if (poiErr) {
    throw new Error(`Failed to fetch POIs: ${poiErr.message}`);
  }

  let targetPois: PoiCandidate[] = (allPois || []).filter(
    (p: PoiCandidate) => !reviewedPoiIds.has(p.id)
  );

  console.log(`Found ${targetPois.length} POIs with no existing reviews (out of ${allPois?.length || 0} total POIs).`);

  if (typeof limit === 'number' && limit > 0) {
    targetPois = targetPois.slice(0, limit);
    console.log(`Processing limited subset: ${targetPois.length} POI(s).`);
  }

  if (targetPois.length === 0) {
    console.log('No POIs need reviews. Exiting.');
    console.log('Final summary: Processed: 0, Skipped: 0, Failed: 0');
    return;
  }

  const BATCH_SIZE = 5;
  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < targetPois.length; i += BATCH_SIZE) {
      const batch = targetPois.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(targetPois.length / BATCH_SIZE);

      console.log(`\n--- Processing Batch ${batchNum}/${totalBatches} (${batch.length} POIs) ---`);

      // Prompt contains ONLY name and category
      const poiText = batch
        .map((p) => `- POI ID: ${p.id}\n  Name: "${p.name}"\n  Category: "${p.category}"`)
        .join('\n');

      const prompt = `You are generating sample customer reviews for local points of interest (POIs) in a demo map application.
For each POI listed below, generate 4 to 6 realistic reviews.

POIs:
${poiText}

Rules:
1. Reviews are SAMPLE data for a demo; keep them generic, plausible, and appropriate for the category.
2. For each review, provide:
   - author: A common first name (e.g. Rahul, Priya, Amit, Sneha, Vikram, Pooja, Neha, Rohan).
   - rating: Integer between 1 and 5. Mix ratings realistically (mostly 3 to 5, with occasional lower ratings like 1 or 2).
   - text: 1 to 2 sentences of generic, plausible impressions.
3. Strict safety and accuracy constraints:
   - Do NOT mention prices or specific currency amounts.
   - Do NOT mention opening hours, schedules, or timings.
   - Do NOT mention specific menu items, dishes, or products.
   - Do NOT include brand claims, trademarks, or slogans.
   - Do NOT mention staff names, owner names, or employee details.
   - Do NOT mention street addresses, phone numbers, or exact coordinates.
   - Do NOT claim anything specific about a named chain or company.
4. Return the exact matching poi_id for each POI.`;

      const result = await callWithRetry(async () => {
        return await generateObject({
          model,
          schema: reviewsBatchSchema,
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

        const validReviews = item.reviews.filter(
          (r) =>
            typeof r.author === 'string' &&
            r.author.trim().length > 0 &&
            typeof r.rating === 'number' &&
            r.rating >= 1 &&
            r.rating <= 5 &&
            typeof r.text === 'string' &&
            r.text.trim().length > 0
        );

        if (validReviews.length === 0) {
          console.warn(`[Warning] No valid reviews for POI ${poi.id} (${poi.name}). Skipping.`);
          skippedCount++;
          continue;
        }

        const ratingSum = validReviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = Math.round((ratingSum / validReviews.length) * 10) / 10;

        if (isDryRun) {
          console.log(`\n[DRY RUN] POI: "${poi.name}" (${poi.category}) [ID: ${poi.id}]`);
          console.log(`  Calculated Average Rating: ${avgRating} (${validReviews.length} reviews)`);
          validReviews.forEach((r, idx) => {
            console.log(`  Review #${idx + 1} (${r.rating}/5) by ${r.author}: "${r.text}"`);
          });
          processedCount++;
        } else {
          // 1. Insert reviews into reviews table with is_sample = true
          const rowsToInsert = validReviews.map((r) => ({
            poi_id: poi.id,
            author: r.author.trim(),
            rating: r.rating,
            text: r.text.trim(),
            is_sample: true,
          }));

          const { error: insertErr } = await supabase.from('reviews').insert(rowsToInsert);
          if (insertErr) {
            console.error(`Failed to insert reviews for ${poi.name}: ${insertErr.message}`);
            failedCount++;
            continue;
          }

          // 2. Set pois.rating = rounded average
          const { error: updateErr } = await supabase
            .from('pois')
            .update({ rating: avgRating })
            .eq('id', poi.id);

          if (updateErr) {
            console.error(`Failed to update rating for ${poi.name}: ${updateErr.message}`);
            failedCount++;
            continue;
          }

          console.log(`Saved ${validReviews.length} reviews & rating ${avgRating} for "${poi.name}"`);
          processedCount++;
        }
      }

      // Check for any POIs in the batch omitted by the model
      for (const p of batch) {
        if (!returnedIds.has(p.id)) {
          console.warn(`[Warning] Model omitted POI in response: ${p.id} ("${p.name}")`);
          skippedCount++;
        }
      }

      // Pause between calls if more batches remain
      if (i + BATCH_SIZE < targetPois.length) {
        console.log(`Pausing ${pauseMs}ms before next call...`);
        await sleep(pauseMs);
      }
    }
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error(`\n[Fatal Error] Generation stopped: ${errorObj.message || err}`);
    console.log('\nTo resume execution, re-run:');
    console.log('  npm run gen:reviews');
    console.log('Or to re-run with a specific limit:');
    console.log('  npm run gen:reviews -- --limit 5');
    console.log(
      `Final summary: Processed: ${processedCount}, Skipped: ${skippedCount}, Failed: ${failedCount + (targetPois.length - (processedCount + skippedCount))}`
    );
    process.exit(1);
  }

  console.log(`\nFinal summary: Processed: ${processedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
}

main().catch((err) => {
  console.error('\nScript failure:', err instanceof Error ? err.message : err);
  process.exit(1);
});
