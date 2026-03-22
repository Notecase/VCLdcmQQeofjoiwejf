/**
 * Strip markdown JSON code fences from LLM output.
 * Handles ```json ... ``` wrapping that models often add around JSON responses.
 */
export function stripJsonFences(text: string): string {
  return text.replace(/```json\n?|\n?```/g, '').trim()
}
