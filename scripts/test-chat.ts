interface ChatContext {
  userLocation: { lng: number; lat: number } | null;
  bounds: { west: number; south: number; east: number; north: number } | null;
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
}

interface DestinationResult {
  id: string;
  name: string;
  lng?: number;
  lat?: number;
}

interface ToolOutputSummary {
  error?: string;
  places?: PlaceResultItem[];
  destination?: DestinationResult;
  distanceM?: number;
  durationS?: number;
  mode?: string;
  centerUsed?: string;
  note?: string;
  ok?: boolean;
  action?: string;
  userLocation?: unknown;
  bounds?: unknown;
}

function summarizeToolOutput(output: unknown): string {
  if (!output || typeof output !== 'object') return String(output);
  const out = output as ToolOutputSummary;
  if (out.error) return `Error: ${out.error}`;
  if (Array.isArray(out.places)) {
    const list = out.places
      .map((p) => `${p.name} (${p.distanceM}m${p.rating ? `, ${p.rating}★` : ''})`)
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
  console.log('Starting Day 4.2 Chat Tools Test...');
  console.log(`Context: Pari Chowk (lng=${pariChowkContext.userLocation?.lng}, lat=${pariChowkContext.userLocation?.lat})\n`);

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

  console.log('\n========================================');
  console.log('All 4 test queries finished.');
  console.log('========================================');
}

main().catch((err) => {
  console.error('Test chat error:', err);
  process.exit(1);
});
