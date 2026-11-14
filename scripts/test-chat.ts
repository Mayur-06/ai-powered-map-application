interface ChatContext {
  userLocation: { lng: number; lat: number } | null;
  bounds: { west: number; south: number; east: number; north: number } | null;
}

const sampleContext: ChatContext = {
  userLocation: { lng: 77.503, lat: 28.4744 },
  bounds: { west: 77.45, south: 28.43, east: 77.55, north: 28.52 },
};

async function streamQuery(prompt: string, context: ChatContext): Promise<string> {
  const url = process.env.TEST_CHAT_URL || 'http://localhost:3000/api/chat';

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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'text-delta' && typeof parsed.delta === 'string') {
          fullText += parsed.delta;
          process.stdout.write(parsed.delta);
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  if (buffer.trim().startsWith('data: ')) {
    const data = buffer.trim().slice(6).trim();
    if (data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'text-delta' && typeof parsed.delta === 'string') {
          fullText += parsed.delta;
          process.stdout.write(parsed.delta);
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  process.stdout.write('\n');
  return fullText;
}

async function main() {
  console.log('=== Test 1: "hello, who are you?" ===');
  const output1 = await streamQuery('hello, who are you?', sampleContext);
  console.log(`[Test 1 Response Length: ${output1.length} chars]\n`);

  console.log('=== Test 2: "find me a cafe near me" ===');
  const output2 = await streamQuery('find me a cafe near me', sampleContext);
  console.log(`[Test 2 Response Length: ${output2.length} chars]\n`);

  console.log('=== Verification ===');
  console.log('Query 1 received streamed response:', output1.length > 0 ? 'PASS' : 'FAIL');
  console.log('Query 2 received streamed response:', output2.length > 0 ? 'PASS' : 'FAIL');
}

main().catch((err) => {
  console.error('Test chat error:', err);
  process.exit(1);
});
