interface ChatContext {
  userLocation: { lng: number; lat: number } | null;
  bounds: { west: number; south: number; east: number; north: number } | null;
  prefs?: {
    interests: string[];
    budget: 'low' | 'medium' | 'any';
    transport: 'drive' | 'walk' | 'cycle';
  } | null;
}

const pariChowkContext: ChatContext = {
  userLocation: { lng: 77.5081, lat: 28.4631 },
  bounds: { west: 77.46, south: 28.42, east: 77.56, north: 28.51 },
};

interface PlaceResultItem {
  id: string;
  name: string;
  category: string;
  rating: number | null;
  distanceM: number;
  lng: number;
  lat: number;
  reason?: string;
}

interface DestinationResult {
  id: string;
  name: string;
  lng?: number;
  lat?: number;
}

interface OrderedStopItem {
  order: number;
  id: string;
  name: string;
}

interface ToolOutputSummary {
  error?: string;
  places?: PlaceResultItem[];
  destination?: DestinationResult;
  distanceM?: number;
  durationS?: number;
  totalDistanceM?: number;
  totalDurationS?: number;
  orderedStops?: OrderedStopItem[];
  mode?: string;
  centerUsed?: string;
  note?: string;
  ok?: boolean;
  action?: string;
  userLocation?: unknown;
  bounds?: unknown;
  name?: string;
  summary?: unknown;
}

function summarizeToolOutput(output: unknown): string {
  if (!output || typeof output !== 'object') return String(output);
  const out = output as ToolOutputSummary;
  if (out.error) return `Error: ${out.error}`;
  if (Array.isArray(out.orderedStops)) {
    const list = out.orderedStops.map((s) => `${s.order}. ${s.name}`).join(' -> ');
    const durMin =
      out.totalDurationS !== undefined ? `~${Math.round(out.totalDurationS / 60)} min` : '';
    return `Optimized multi-stop (${list}): ${out.totalDistanceM ?? '--'}m, ${durMin} (${out.mode || 'drive'})`;
  }
  if (out.summary !== undefined) {
    const sum = out.summary as {
      vibe?: string;
      pros?: string[];
      cons?: string[];
      sentimentScore?: number;
    } | null;
    if (sum) {
      return `Summary for "${out.name}": vibe="${sum.vibe}", pros=${sum.pros?.length || 0}, cons=${sum.cons?.length || 0}${out.note ? ` (note: ${out.note})` : ''}`;
    }
    return `Summary for "${out.name}": none (${out.note || 'No summary'})`;
  }
  if (Array.isArray(out.places)) {
    const list = out.places
      .map(
        (p) =>
          `${p.name} (${p.distanceM}m${p.rating ? `, ${p.rating}★` : ''}${
            p.reason ? ` [${p.reason}]` : ''
          })`
      )
      .join(', ');
    return `${out.places.length} place(s) [${list || 'none'}] (center: ${out.centerUsed}${out.note ? `, note: "${out.note}"` : ''})`;
  }
  if (out.destination) {
    const durMin = out.durationS !== undefined ? `~${Math.round(out.durationS / 60)} min` : '';
    return `Route to ${out.destination.name}: ${out.distanceM}m, ${durMin} (${out.mode || 'drive'})`;
  }
  if (out.ok && out.action) {
    return `MapControl "${out.action}" ok: ${JSON.stringify(output)}`;
  }
  if (out.userLocation !== undefined) {
    return `UserContext: location=${JSON.stringify(out.userLocation)}`;
  }
  return JSON.stringify(output).slice(0, 160);
}

async function streamQuery(prompt: string, context: ChatContext): Promise<string> {
  const url = process.env.TEST_CHAT_URL || 'http://localhost:3000/api/chat';

  console.log(`\n========================================`);
  console.log(`Query: "${prompt}"`);
  console.log(`========================================`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: prompt }],
        },
      ],
      context,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body has no readable stream');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) return;
    const data = trimmed.slice(6).trim();
    if (data === '[DONE]') return;
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'tool-input-available') {
        console.log(`\n[Tool Call] ${parsed.toolName}`);
        console.log(`  Input: ${JSON.stringify(parsed.input)}`);
      } else if (parsed.type === 'tool-output-available') {
        console.log(`[Tool Result] ${summarizeToolOutput(parsed.output)}`);
      } else if (parsed.type === 'tool-input-error' || parsed.type === 'tool-output-error') {
        console.log(`[Tool Error] ${parsed.errorText || 'Unknown tool error'}`);
      } else if (parsed.type === 'text-delta' && typeof parsed.delta === 'string') {
        fullText += parsed.delta;
      } else if (parsed.type === 'error') {
        console.log(`[Stream Error] ${parsed.errorText}`);
      }
    } catch {
      // Skip unparseable line
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      handleLine(line);
    }
  }

  if (buffer.trim().length > 0) {
    handleLine(buffer);
  }

  console.log(`\n[Final Text]`);
  console.log(fullText.trim());
  return fullText.trim();
}

async function sleep(ms: number) {
  console.log(`\n(Pausing ${ms / 1000}s to observe rate limits...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const runAll = process.argv.includes('--all');
  const runDay51 = process.argv.includes('--day5-1');
  const runDay53 = process.argv.includes('--day5-3');
  const runDay61 = process.argv.includes('--day6-1') || (!runAll && !runDay51 && !runDay53);

  if (runDay61) {
    console.log('Starting Day 6.1 Multi-Stop Route Optimization Chat Test...');
    console.log(
      `Context: Pari Chowk (lng=${pariChowkContext.userLocation?.lng}, lat=${pariChowkContext.userLocation?.lat})\n`
    );
    await streamQuery(
      'I need to stop at a pharmacy and an ATM, then go to a hospital',
      pariChowkContext
    );
    console.log('\n========================================');
    console.log('Test query finished.');
    console.log('========================================');
    return;
  }

  if (runAll) {
    console.log('Starting full Chat Tools Test Suite...');
    console.log(
      `Context: Pari Chowk (lng=${pariChowkContext.userLocation?.lng}, lat=${pariChowkContext.userLocation?.lat})\n`
    );

    // Message 1
    await streamQuery('find a cafe near me', pariChowkContext);
    await sleep(15000);

    // Message 2
    await streamQuery('take me to the nearest pharmacy', pariChowkContext);
    await sleep(15000);

    // Message 3
    await streamQuery('is there a Starbucks near me?', pariChowkContext);
    await sleep(15000);

    // Message 4
    await streamQuery('find a hospital within 500 metres', pariChowkContext);
    await sleep(15000);

    // Message 5: Review summary query
    await streamQuery('what do people say about Nimt Hospital?', pariChowkContext);
    await sleep(15000);
  } else if (runDay51) {
    console.log('Starting Day 5.1 Review Summarization Chat Test...');
    console.log(
      `Context: Pari Chowk (lng=${pariChowkContext.userLocation?.lng}, lat=${pariChowkContext.userLocation?.lat})\n`
    );
    await streamQuery('what do people say about Nimt Hospital?', pariChowkContext);
    return;
  } else if (runDay53) {
    // Day 5.3 Preferences and Personalized Ranking Test
    console.log('Starting Day 5.3 Preferences & Personalized Ranking Chat Test...');
    const prefsContext: ChatContext = {
      ...pariChowkContext,
      prefs: {
        interests: ['park'],
        budget: 'any',
        transport: 'walk',
      },
    };
    console.log(
      `Context: Pari Chowk (lng=${prefsContext.userLocation?.lng}, lat=${prefsContext.userLocation?.lat}) with prefs: interests=['park'], budget='any', transport='walk'\n`
    );

    await streamQuery('what should I do nearby?', prefsContext);

    console.log('\n========================================');
    console.log('Test query finished.');
    console.log('========================================');
  }
}

main().catch((err) => {
  console.error('Test chat error:', err);
  process.exit(1);
});
