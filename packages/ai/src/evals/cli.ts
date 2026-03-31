/**
 * Eval CLI — Entry point for running evaluations from the command line
 *
 * Usage:
 *   pnpm eval                                    # Run full suite
 *   pnpm eval --category note-creation            # Run one category
 *   pnpm eval --case nc-001                       # Run single test case
 *   pnpm eval --model gemini-3-flash-preview      # Override generator model
 *   pnpm eval --judge-model gemini-2.5-pro        # Override judge model
 *   pnpm eval --output results/eval.json          # Save results to file
 */

import { createClient } from '@supabase/supabase-js'
import { EvalRunner } from './runner'
import type { TestCategory } from './types'

// =============================================================================
// Arg Parsing
// =============================================================================

function parseArgs(): {
  category?: TestCategory
  caseId?: string
  model?: string
  judgeModel?: string
  mode: 'live' | 'mocked'
  output?: string
  baseline?: string
} {
  const args = process.argv.slice(2)
  const result: ReturnType<typeof parseArgs> = { mode: 'mocked' }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]

    switch (arg) {
      case '--category':
        result.category = next as TestCategory
        i++
        break
      case '--case':
        result.caseId = next
        i++
        break
      case '--model':
        result.model = next
        i++
        break
      case '--judge-model':
        result.judgeModel = next
        i++
        break
      case '--mode':
        result.mode = next as 'live' | 'mocked'
        i++
        break
      case '--output':
        result.output = next
        i++
        break
      case '--baseline':
        result.baseline = next
        i++
        break
    }
  }

  return result
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = parseArgs()

  // Create Supabase client
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
  const userId = process.env.EVAL_USER_ID ?? 'eval-user'

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables')
    console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or use --mode mocked')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const runner = new EvalRunner({
    supabase,
    userId,
    generatorModel: args.model,
    judgeModel: args.judgeModel,
    mode: args.mode,
    baselinePath: args.baseline,
    outputPath: args.output,
  })

  try {
    if (args.caseId) {
      // Single case mode
      const result = await runner.runSingleCase(args.caseId)
      process.exit(result.passed ? 0 : 1)
    } else {
      // Suite mode
      const report = await runner.runSuite({
        categories: args.category ? [args.category] : undefined,
      })
      process.exit(report.launchReady ? 0 : 1)
    }
  } catch (error) {
    console.error('Eval failed:', error)
    process.exit(2)
  }
}

main()
