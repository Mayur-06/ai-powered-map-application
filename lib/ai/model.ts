import { createGoogleGenerativeAI } from '@ai-sdk/google';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const modelName = process.env.LLM_MODEL;

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
