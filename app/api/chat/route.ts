import { NextRequest, NextResponse } from 'next/server';
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  APICallError,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { getModel, getFallbackModel } from '@/lib/ai/model';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { createTools } from '@/lib/ai/tools';
import { userPrefsSchema, type UserPrefs } from '@/lib/prefs';
import {
  rateLimit,
  checkDailyCap,
  incrementDailyCap,
  getClientIp,
} from '@/lib/rateLimit';

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(1000, 'Text part must not exceed 1000 characters'),
});

const nonTextPartSchema = z
  .object({
    type: z.string().refine((t) => t !== 'text', {
      message: 'Text parts must follow the text part schema',
    }),
  })
  .passthrough();

const partSchema = z.union([textPartSchema, nonTextPartSchema]);

const messageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(['system', 'user', 'assistant']),
    parts: z.array(partSchema).optional(),
    content: z
      .string()
      .max(1000, 'Message content must not exceed 1000 characters')
      .optional(),
  })
  .passthrough()
  .refine(
    (m) =>
      (Array.isArray(m.parts) && m.parts.length > 0) ||
      (typeof m.content === 'string' && m.content.length > 0),
    { message: 'Each message must have at least one part or non-empty content' }
  );

const userLocationSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

const boundsSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
});

const contextSchema = z
  .object({
    userLocation: userLocationSchema.nullable().optional(),
    bounds: boundsSchema.nullable().optional(),
    prefs: z.unknown().optional(),
  })
  .nullable()
  .optional();

const chatRequestSchema = z
  .object({
    messages: z
      .array(messageSchema)
      .min(1, 'At least one message is required')
      .max(20, 'Maximum of 20 messages allowed'),
    context: contextSchema,
    id: z.string().optional(),
    trigger: z.unknown().optional(),
    messageId: z.string().optional(),
  })
  .passthrough();

export async function POST(request: NextRequest) {
  // Check global daily cap
  if (!checkDailyCap().allowed) {
    return NextResponse.json(
      {
        error: 'daily_limit',
        message: 'The demo has reached its daily limit. Please try again tomorrow.',
      },
      { status: 429 }
    );
  }

  // Check client IP sliding-window rate limit
  const clientIp = getClientIp(request);
  const rateLimitResult = rateLimit(clientIp);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Too many requests. Please wait a bit and try again.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfterSeconds),
        },
      }
    );
  }

  // Reject any request body larger than 20 KB with 413
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 20 * 1024) {
    return NextResponse.json(
      { error: 'payload_too_large', message: 'Request body exceeds 20 KB limit.' },
      { status: 413 }
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
  }

  if (new TextEncoder().encode(rawBody).length > 20 * 1024) {
    return NextResponse.json(
      { error: 'payload_too_large', message: 'Request body exceeds 20 KB limit.' },
      { status: 413 }
    );
  }

  // Count valid request against daily cap
  incrementDailyCap();

  let bodyJson: unknown;
  try {
    bodyJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const normalizedMessages: UIMessage[] = parsed.data.messages.map(
    (m, index) => {
      const parts =
        m.parts && m.parts.length > 0
          ? m.parts
          : [{ type: 'text' as const, text: m.content! }];

      return {
        id: m.id || `msg-${index}-${Date.now()}`,
        role: m.role,
        parts,
      } as unknown as UIMessage;
    }
  );

  let validPrefs: UserPrefs | null = null;
  if (parsed.data.context?.prefs) {
    const prefsParsed = userPrefsSchema.safeParse(parsed.data.context.prefs);
    if (prefsParsed.success) {
      validPrefs = prefsParsed.data;
    }
  }

  const isRetryableError = (err: unknown): boolean => {
    if (APICallError.isInstance(err)) {
      const status = err.statusCode ?? 500;
      return status === 429 || status >= 500;
    }
    const message = err instanceof Error ? err.message : '';
    return (
      message.includes('429') ||
      message.toLowerCase().includes('rate limit') ||
      message.includes('500') ||
      message.includes('503') ||
      message.includes('504')
    );
  };

  try {
    const primaryModel = getModel();
    const fallbackModel = getFallbackModel();

    const tools = createTools({
      userLocation: parsed.data.context?.userLocation ?? null,
      bounds: parsed.data.context?.bounds ?? null,
      prefs: validPrefs,
    });
    const modelMessages = await convertToModelMessages(normalizedMessages, {
      tools,
    });

    const createStream = (m: ReturnType<typeof getModel>) =>
      streamText({
        model: m,
        system: buildSystemPrompt({
          userLocation: parsed.data.context?.userLocation ?? null,
          bounds: parsed.data.context?.bounds ?? null,
          prefs: validPrefs,
        }),
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(6),
        maxOutputTokens: 400,
        onError: () => 'An error occurred while generating the response. Please try again.',
      });

    let result;
    try {
      result = createStream(primaryModel);
    } catch (primaryError: unknown) {
      if (fallbackModel && isRetryableError(primaryError)) {
        result = createStream(fallbackModel);
      } else {
        throw primaryError;
      }
    }

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    if (APICallError.isInstance(error)) {
      const status = error.statusCode ?? 500;
      if (status === 429) {
        return NextResponse.json(
          { error: 'The AI service is currently busy. Please try again shortly.' },
          { status: 429 }
        );
      }
      if (status >= 500) {
        return NextResponse.json(
          { error: 'An upstream AI service error occurred. Please try again later.' },
          { status }
        );
      }
      return NextResponse.json(
        { error: 'Failed to process AI request. Please try again.' },
        { status: status >= 400 && status < 600 ? status : 500 }
      );
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return NextResponse.json(
        { error: 'The AI service is currently busy. Please try again shortly.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'An internal server error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
