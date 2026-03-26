/**
 * Capability Registry Types
 *
 * Higher-level than the fine-grained tool registry (tools/index.ts).
 * Capabilities wrap agent-level operations and can use tools internally.
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CapabilityContext {
  userId: string
  supabase: SupabaseClient
  emitEvent?: (event: { type: string; data: unknown }) => void
  timezone?: string
}

export interface Capability {
  name: string
  description: string
  inputSchema: z.ZodSchema
  execute: (input: unknown, context: CapabilityContext) => Promise<string>
}

export interface DelegationLog {
  parentAgent: string
  capability: string
  inputSummary: string
  outputSummary: string
  durationMs: number
  timestamp: string
}
