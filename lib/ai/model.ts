import { createGoogleGenerativeAI } from '@ai-sdk/google';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const modelName = process.env.LLM_MODEL;
const fallbackModelName = process.env.LLM_FALLBACK_MODEL;

const google = createGoogleGenerativeAI({
  apiKey: apiKey || '',
});

/**
 * Default model instance exported from environment variables.
 * Key: GOOGLE_GENERATIVE_AI_API_KEY
 * Model: LLM_MODEL
 */
export const model = google(modelName || '');

/**
 * Optional fallback model instance if LLM_FALLBACK_MODEL is set in environment.
 */
export const fallbackModel = fallbackModelName ? google(fallbackModelName) : null;

/**
 * Returns a configured Google Generative AI model instance,
 * validating required environment variables at call time.
 */
export function getModel() {
  const currentKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const currentModel = process.env.LLM_MODEL;

  if (!currentKey) {
    throw new Error(
      'Missing required environment variable GOOGLE_GENERATIVE_AI_API_KEY'
    );
  }
  if (!currentModel) {
    throw new Error('Missing required environment variable LLM_MODEL');
  }

  const customGoogle = createGoogleGenerativeAI({ apiKey: currentKey });
  return customGoogle(currentModel);
}

/**
 * Returns the fallback Google Generative AI model instance if LLM_FALLBACK_MODEL is configured.
 */
export function getFallbackModel() {
  const currentKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const currentFallback = process.env.LLM_FALLBACK_MODEL;

  if (!currentKey || !currentFallback) {
    return null;
  }

  const customGoogle = createGoogleGenerativeAI({ apiKey: currentKey });
  return customGoogle(currentFallback);
}
