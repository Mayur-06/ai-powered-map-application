import { NextRequest, NextResponse } from 'next/server';
import { streamText, convertToModelMessages, APICallError, type UIMessage } from 'ai';
import { z } from 'zod';
import { getModel } from '@/lib/ai/model';
import { buildSystemPrompt } from '@/lib/ai/prompts';

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
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
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

  try {
    const model = getModel();
    const modelMessages = await convertToModelMessages(normalizedMessages);

    const result = streamText({
      model,
      system: buildSystemPrompt(parsed.data.context),
      messages: modelMessages,
      maxOutputTokens: 400,
      onError: () => 'An error occurred while generating the response. Please try again.',
    });

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
