/**
 * Google Gemini Safety Settings
 *
 * Centralized safety configuration for all Gemini model calls.
 * Gemini 2.5/3 defaults to OFF for safety filtering when unspecified —
 * this module ensures all categories are explicitly set.
 */

export const defaultSafetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT' as const, threshold: 'BLOCK_MEDIUM_AND_ABOVE' as const },
  { category: 'HARM_CATEGORY_HATE_SPEECH' as const, threshold: 'BLOCK_MEDIUM_AND_ABOVE' as const },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as const,
    threshold: 'BLOCK_MEDIUM_AND_ABOVE' as const,
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as const,
    threshold: 'BLOCK_MEDIUM_AND_ABOVE' as const,
  },
]

/**
 * Returns providerOptions for Google models with safety settings.
 * Pass this to streamText/generateText calls when using Gemini models.
 *
 * @example
 *   streamText({
 *     model,
 *     messages,
 *     providerOptions: getGoogleProviderOptions(),
 *   })
 */
export function getGoogleProviderOptions() {
  return {
    google: {
      safetySettings: defaultSafetySettings,
    },
  } as const
}
