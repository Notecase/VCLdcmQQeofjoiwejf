/**
 * Calibration Logic
 *
 * Golden examples with human-assigned scores for each evaluation dimension.
 * Used to anchor LLM judge scoring and detect drift.
 *
 * A dimension is considered calibrated when mean |judgeScore - humanScore| <= 0.5
 */

import type { CalibrationExample, CalibrationCheck, DimensionName } from '../types'
import { evaluateWithJudge } from '../evaluators/llm-judge'

// =============================================================================
// Golden Calibration Examples (2 per dimension, 14 total)
// =============================================================================

export const CALIBRATION_EXAMPLES: CalibrationExample[] = [
  // --- depth ---
  {
    dimension: 'depth',
    score: 2,
    prompt: 'Explain how HTTP caching works.',
    output:
      'HTTP caching stores responses so they can be reused later. Browsers and servers use cache headers to decide when to cache things. This makes websites faster.',
    reasoning:
      'Only explains the basic concept without discussing Cache-Control directives, ETags, conditional requests, CDN layers, or cache invalidation strategies. Superficial.',
  },
  {
    dimension: 'depth',
    score: 5,
    prompt: 'Explain how HTTP caching works.',
    output:
      'HTTP caching operates at multiple layers: browser cache, shared proxy caches, and CDN edge nodes. The Cache-Control header (RFC 7234) governs behavior with directives like max-age, no-cache, no-store, and stale-while-revalidate. Conditional requests use ETag (content hash) and Last-Modified headers to validate stale entries via 304 Not Modified responses, avoiding full retransmission. The Vary header prevents incorrect cache hits when responses differ by request headers (e.g., Accept-Encoding). Cache invalidation remains the hardest problem: purge-by-tag (Surrogate-Key), path-based purge, and stale-while-revalidate each have trade-offs. Modern patterns like ISR (Incremental Static Regeneration) layer application-level caching atop HTTP semantics.',
    reasoning:
      'Covers all layers (browser, proxy, CDN), specific headers with RFC reference, conditional requests, Vary header edge case, invalidation strategies with named patterns, and modern framework integration. Expert-level depth.',
  },

  // --- structure ---
  {
    dimension: 'structure',
    score: 1,
    prompt: 'Write a guide on setting up a PostgreSQL database.',
    output:
      'You need to install PostgreSQL first. Then create a database. You can use psql to connect. Make sure you set a password. Tables are created with CREATE TABLE. You should also think about indexes. Backups are important too. Use pg_dump for that.',
    reasoning:
      'No headings, no sections, no logical grouping. Stream-of-consciousness sentences with no hierarchy or progression. Impossible to scan.',
  },
  {
    dimension: 'structure',
    score: 4,
    prompt: 'Write a guide on setting up a PostgreSQL database.',
    output:
      "## Prerequisites\nEnsure you have admin access and at least 512MB free disk space.\n\n## Installation\nOn Ubuntu: `sudo apt install postgresql-16`\nOn macOS: `brew install postgresql@16`\n\n## Initial Configuration\n1. Start the service: `sudo systemctl start postgresql`\n2. Set the postgres user password: `sudo -u postgres psql -c \"ALTER USER postgres PASSWORD '...';\"`\n\n## Creating Your First Database\n```sql\nCREATE DATABASE myapp;\nCREATE USER myapp_user WITH ENCRYPTED PASSWORD '...';\nGRANT ALL PRIVILEGES ON DATABASE myapp TO myapp_user;\n```\n\n## Next Steps\nConsider setting up automated backups with `pg_dump` and configuring `pg_hba.conf` for remote access.",
    reasoning:
      'Clear section hierarchy with headings, numbered steps for sequential operations, code blocks for commands, and a forward-looking conclusion. Missing transitions between sections keeps it from a 5.',
  },

  // --- citation-integrity ---
  {
    dimension: 'citation-integrity',
    score: 1,
    prompt: 'What are the health benefits of intermittent fasting?',
    output:
      'According to a 2023 study by Dr. James Robertson published in the New England Journal of Medicine, intermittent fasting reduces cancer risk by 47%. The WHO recommends 16:8 fasting for all adults.',
    reasoning:
      'Both citations are fabricated. No such NEJM study exists, and the WHO has not issued such a recommendation. Actively misleading with specific but fake details.',
  },
  {
    dimension: 'citation-integrity',
    score: 4,
    prompt: 'What are the health benefits of intermittent fasting?',
    output:
      'Research by Mattson et al. (2017, Annual Review of Neuroscience) suggests intermittent fasting improves metabolic markers including insulin sensitivity. The CALERIE trial (Kraus et al., 2019, The Lancet Diabetes & Endocrinology) found that moderate caloric restriction improved cardiometabolic risk factors over two years. However, a 2023 AHA presentation by Zhong et al. raised concerns about 16:8 fasting and cardiovascular mortality, though this was observational data with methodological limitations.',
    reasoning:
      'Cites real researchers and publications with years. Mentions methodology limitations. Missing direct URLs or DOIs keeps it from a 5, but claims are verifiable.',
  },

  // --- synthesis ---
  {
    dimension: 'synthesis',
    score: 2,
    prompt: 'Compare React and Vue for building enterprise applications.',
    output:
      'React is a JavaScript library maintained by Meta. It uses JSX and has a large ecosystem. Vue is a JavaScript framework created by Evan You. It uses templates and is easier to learn. React has more jobs. Vue has better documentation.',
    reasoning:
      'Lists facts about each framework in isolation. No comparative analysis, no synthesized recommendation, no discussion of how the differences matter for enterprise use cases specifically.',
  },
  {
    dimension: 'synthesis',
    score: 5,
    prompt: 'Compare React and Vue for building enterprise applications.',
    output:
      "The React vs. Vue decision for enterprise hinges on three axes: team scalability, ecosystem maturity, and long-term maintenance cost. React's \"primitives-first\" philosophy (hooks, context) gives architects more control but demands stronger conventions -- companies like Airbnb invest heavily in internal style guides and custom abstractions. Vue's opinionated structure (Options/Composition API, Pinia, Vue Router as official packages) reduces decision fatigue but can feel constraining for teams with specific architectural needs. A non-obvious factor: React's concurrent features (Suspense, transitions) are designed for the exact problems enterprises face -- large component trees with mixed data-fetching patterns. Vue 3's reactivity system is more predictable for debugging (no stale closure bugs) but lacks equivalent concurrent primitives. The pragmatic answer: React if your team has senior architects who will enforce patterns; Vue if you want the framework to enforce them.",
    reasoning:
      "Creates a novel three-axis framework for comparison. Surfaces non-obvious insight about concurrent features vs. reactivity predictability. Synthesizes into a practical decision heuristic that neither framework's docs would provide.",
  },

  // --- intent-alignment ---
  {
    dimension: 'intent-alignment',
    score: 2,
    prompt: 'Create a weekly meal plan for someone trying to lose weight.',
    output:
      'Weight loss is achieved through a caloric deficit. The recommended daily intake varies by age, gender, and activity level. Macronutrients include proteins, carbohydrates, and fats. Protein is especially important for preserving muscle mass during weight loss. Here are some healthy foods: chicken, broccoli, rice, salmon, eggs.',
    reasoning:
      'Provides general nutrition information but never actually creates a meal plan. The user asked for a structured weekly plan with specific meals, not a nutrition lecture.',
  },
  {
    dimension: 'intent-alignment',
    score: 5,
    prompt: 'Create a weekly meal plan for someone trying to lose weight.',
    output:
      '## 7-Day Weight Loss Meal Plan (~1,500 kcal/day)\n\n### Monday\n- **Breakfast**: Greek yogurt with berries and 1 tbsp chia seeds (320 kcal)\n- **Lunch**: Grilled chicken salad with olive oil dressing (450 kcal)\n- **Dinner**: Baked salmon with roasted vegetables (480 kcal)\n- **Snack**: Apple with 1 tbsp almond butter (200 kcal)\n\n[...continues for all 7 days...]\n\n### Grocery List\nProteins: chicken breast (2 lb), salmon fillets (1 lb), eggs (1 dozen)...\n\n### Meal Prep Tips\n- Cook proteins in bulk on Sunday\n- Pre-chop vegetables for the week\n\n### Adjustments\n- More active? Add a 200 kcal snack\n- Vegetarian? Swap proteins for tofu/tempeh equivalents listed above',
    reasoning:
      'Delivers exactly what was asked (structured weekly plan) with calorie counts, includes an unprompted but highly useful grocery list and prep tips, and anticipates common adjustments. Exceeds the request while staying focused.',
  },

  // --- voice-preservation ---
  {
    dimension: 'voice-preservation',
    score: 2,
    prompt: '[Editing a casual dev blog post] Add a paragraph about error handling.',
    output:
      'Error handling constitutes a critical aspect of software engineering methodology. Implementing robust exception management frameworks ensures system resilience and facilitates debugging procedures. It is imperative that developers adhere to established best practices.',
    reasoning:
      'The original is a casual dev blog but the addition reads like an academic paper. "Constitutes," "methodology," "imperative" -- completely wrong register for the context.',
  },
  {
    dimension: 'voice-preservation',
    score: 4,
    prompt:
      '[Editing a casual dev blog post with conversational tone] Add a paragraph about error handling.',
    output:
      'Look, nobody likes writing error handling code. But future-you will thank present-you when that weird edge case hits at 2am and your logs actually tell you what happened. Wrap your async calls in try-catch, give your errors meaningful messages, and for the love of all that is holy, stop catching errors and silently swallowing them.',
    reasoning:
      'Matches the casual, conversational tone with humor ("for the love of all that is holy"), second-person address, and developer-relatable scenarios. Reads like the same author wrote it.',
  },

  // --- design-quality ---
  {
    dimension: 'design-quality',
    score: 2,
    prompt: 'Create an HTML dashboard showing sales metrics.',
    output:
      '<html><body><h1>Sales Dashboard</h1><table border="1"><tr><td>Revenue</td><td>$50,000</td></tr><tr><td>Orders</td><td>150</td></tr></table><p>Chart goes here</p></body></html>',
    reasoning:
      'Uses HTML table with border="1" (1990s styling), no CSS, placeholder text instead of actual charts, default browser fonts. Technically renders but looks like a homework assignment.',
  },
  {
    dimension: 'design-quality',
    score: 4,
    prompt: 'Create an HTML dashboard showing sales metrics.',
    output:
      '<div style="font-family: Inter, system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 2rem; background: #f8f9fa;"><h1 style="font-size: 1.5rem; font-weight: 600; color: #1a1a2e;">Sales Dashboard</h1><div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1rem;"><div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"><p style="color: #6b7280; font-size: 0.875rem;">Revenue</p><p style="font-size: 2rem; font-weight: 700; color: #1a1a2e;">$50,000</p><p style="color: #10b981; font-size: 0.875rem;">+12% from last month</p></div><!-- ...more cards... --></div></div>',
    reasoning:
      'Modern design with grid layout, card components, proper typography hierarchy, subtle shadows, and trend indicators. Uses a professional color palette. Missing responsiveness and accessibility attributes keeps it from a 5.',
  },
]

// =============================================================================
// Calibration Utilities
// =============================================================================

/**
 * Get calibration examples for a specific dimension.
 * Returns all golden examples matching the given dimension name.
 */
export function getCalibrationExamples(dimension: DimensionName): CalibrationExample[] {
  return CALIBRATION_EXAMPLES.filter((ex) => ex.dimension === dimension)
}

/**
 * Run calibration check for a single dimension.
 *
 * Sends each calibration example through the judge and compares the judge's
 * score against the human-assigned score. A dimension is considered calibrated
 * when mean |judgeScore - humanScore| <= 0.5.
 *
 * @param dimension - The dimension to calibrate
 * @param options - Optional judge model override
 * @returns CalibrationCheck with per-example deviations and overall calibration status
 */
export async function runCalibrationCheck(
  dimension: DimensionName,
  options?: { model?: string }
): Promise<CalibrationCheck> {
  const examples = getCalibrationExamples(dimension)

  if (examples.length === 0) {
    return {
      dimension,
      calibrated: false,
      meanDeviation: Infinity,
      maxDeviation: Infinity,
      results: [],
    }
  }

  const results: CalibrationCheck['results'] = []

  for (const example of examples) {
    // Run judge WITHOUT calibration examples to avoid self-reference bias
    const judgeResult = await evaluateWithJudge(
      dimension,
      example.prompt,
      example.output,
      1, // Low threshold -- we care about the score, not pass/fail
      options
    )

    const deviation = Math.abs(judgeResult.score - example.score)
    results.push({
      expectedScore: example.score,
      judgeScore: judgeResult.score,
      deviation,
    })
  }

  const totalDeviation = results.reduce((sum, r) => sum + r.deviation, 0)
  const meanDeviation = totalDeviation / results.length
  const maxDeviation = Math.max(...results.map((r) => r.deviation))

  return {
    dimension,
    calibrated: meanDeviation <= 0.5,
    meanDeviation,
    maxDeviation,
    results,
  }
}
