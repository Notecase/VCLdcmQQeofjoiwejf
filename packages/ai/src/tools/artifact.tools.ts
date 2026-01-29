/**
 * Artifact Tools (6 tools)
 *
 * Tools for modifying and validating HTML/CSS/JS artifacts.
 * From Note3: artifact_modify_html, artifact_modify_css, artifact_modify_js,
 * artifact_parse_structure, artifact_get_css_rules, artifact_validate
 */

import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'
import { ToolContext, ToolResult } from './core.tools'

// ============================================================================
// Types
// ============================================================================

interface Artifact {
  id: string
  name: string
  type: 'html' | 'css' | 'js' | 'full'
  content: string
  html?: string
  css?: string
  js?: string
  createdAt: string
  updatedAt?: string
}

interface ParsedHtmlStructure {
  tag: string
  id?: string
  classes?: string[]
  attributes?: Record<string, string>
  children?: ParsedHtmlStructure[]
  textContent?: string
}

interface CssRule {
  selector: string
  properties: Record<string, string>
}

// ============================================================================
// Schema Definitions
// ============================================================================

export const ArtifactModifyHtmlSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
  selector: z.string().optional().describe('CSS selector to target specific element'),
  operation: z
    .enum(['replace', 'append', 'prepend', 'setAttribute', 'removeClass', 'addClass'])
    .describe('Modification operation'),
  content: z.string().optional().describe('New HTML content for replace/append/prepend'),
  attribute: z.string().optional().describe('Attribute name for setAttribute'),
  value: z.string().optional().describe('Attribute value or class name'),
})

export const ArtifactModifyCssSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
  selector: z.string().optional().describe('CSS selector to modify'),
  operation: z
    .enum(['addRule', 'removeRule', 'updateProperty', 'replaceAll'])
    .describe('CSS modification operation'),
  property: z.string().optional().describe('CSS property name'),
  value: z.string().optional().describe('CSS property value'),
  newCss: z.string().optional().describe('Complete new CSS for replaceAll'),
})

export const ArtifactModifyJsSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
  operation: z
    .enum(['replace', 'append', 'prepend', 'wrapInFunction'])
    .describe('JS modification operation'),
  content: z.string().describe('JavaScript code'),
  functionName: z.string().optional().describe('Function name for wrapInFunction'),
})

export const ArtifactParseStructureSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe('Maximum depth to parse'),
})

export const ArtifactGetCssRulesSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
  selectorFilter: z.string().optional().describe('Filter rules by selector pattern'),
})

export const ArtifactValidateSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
  validateHtml: z.boolean().optional().default(true).describe('Validate HTML structure'),
  validateCss: z.boolean().optional().default(true).describe('Validate CSS syntax'),
  validateJs: z.boolean().optional().default(true).describe('Validate JavaScript syntax'),
})

// New tools from Note3 migration
export const ArtifactGetJsFunctionsSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
})

export const ArtifactExtractDependenciesSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
})

export const ArtifactOptimizeSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
  type: z.enum(['size', 'performance', 'a11y']).describe('Optimization type'),
})

export const ArtifactGetColorsSchema = z.object({
  noteId: z.string().uuid().describe('Note containing the artifact'),
  artifactId: z.string().uuid().describe('ID of the artifact'),
})

// ============================================================================
// Type Exports
// ============================================================================

export type ArtifactModifyHtmlInput = z.infer<typeof ArtifactModifyHtmlSchema>
export type ArtifactModifyCssInput = z.infer<typeof ArtifactModifyCssSchema>
export type ArtifactModifyJsInput = z.infer<typeof ArtifactModifyJsSchema>
export type ArtifactParseStructureInput = z.infer<typeof ArtifactParseStructureSchema>
export type ArtifactGetCssRulesInput = z.infer<typeof ArtifactGetCssRulesSchema>
export type ArtifactValidateInput = z.infer<typeof ArtifactValidateSchema>
export type ArtifactGetJsFunctionsInput = z.infer<typeof ArtifactGetJsFunctionsSchema>
export type ArtifactExtractDependenciesInput = z.infer<typeof ArtifactExtractDependenciesSchema>
export type ArtifactOptimizeInput = z.infer<typeof ArtifactOptimizeSchema>
export type ArtifactGetColorsInput = z.infer<typeof ArtifactGetColorsSchema>

// ============================================================================
// Helper Functions
// ============================================================================

async function getArtifact(
  supabase: SupabaseClient,
  userId: string,
  noteId: string,
  artifactId: string
): Promise<{ artifact: Artifact; artifacts: Artifact[]; note: Record<string, unknown> } | null> {
  const { data: note, error } = await supabase
    .from('notes')
    .select('editor_state')
    .eq('id', noteId)
    .eq('user_id', userId)
    .single()

  if (error || !note) return null

  const editorState = (note.editor_state || {}) as { artifacts?: Artifact[] }
  const artifacts = editorState.artifacts || []
  const artifact = artifacts.find((a) => a.id === artifactId)

  if (!artifact) return null

  return { artifact, artifacts, note }
}

async function saveArtifact(
  supabase: SupabaseClient,
  userId: string,
  noteId: string,
  artifacts: Artifact[]
): Promise<boolean> {
  const { error } = await supabase
    .from('notes')
    .update({ editor_state: { artifacts } })
    .eq('id', noteId)
    .eq('user_id', userId)

  return !error
}

function parseSimpleHtml(html: string, maxDepth: number): ParsedHtmlStructure | null {
  // Simple regex-based HTML parser for structure extraction
  // Note: This is a simplified version - production would use a proper parser
  const tagRegex = /<(\w+)([^>]*)>/g
  const elements: ParsedHtmlStructure[] = []
  let match

  let depth = 0
  while ((match = tagRegex.exec(html)) !== null && depth < maxDepth) {
    const [, tag, attrs] = match
    const element: ParsedHtmlStructure = { tag }

    // Parse id
    const idMatch = attrs.match(/id=["']([^"']+)["']/)
    if (idMatch) element.id = idMatch[1]

    // Parse classes
    const classMatch = attrs.match(/class=["']([^"']+)["']/)
    if (classMatch) element.classes = classMatch[1].split(/\s+/)

    elements.push(element)
    depth++
  }

  return elements[0] || null
}

function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = []
  const ruleRegex = /([^{]+)\{([^}]+)\}/g
  let match

  while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim()
    const properties: Record<string, string> = {}

    const propPairs = match[2].split(';')
    for (const pair of propPairs) {
      const [prop, value] = pair.split(':').map((s) => s.trim())
      if (prop && value) {
        properties[prop] = value
      }
    }

    if (selector) {
      rules.push({ selector, properties })
    }
  }

  return rules
}

// ============================================================================
// Tool Implementations
// ============================================================================

export async function artifactModifyHtml(
  input: ArtifactModifyHtmlInput,
  ctx: ToolContext
): Promise<ToolResult<{ modifiedHtml: string }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const { artifact, artifacts } = result
    let html = artifact.html || artifact.content || ''

    switch (input.operation) {
      case 'replace':
        if (input.selector) {
          // Simple selector replacement (basic support)
          const selectorRegex = new RegExp(`(<${input.selector}[^>]*>)[^<]*(</[^>]*>)`, 'gi')
          html = html.replace(selectorRegex, `$1${input.content || ''}$2`)
        } else {
          html = input.content || ''
        }
        break
      case 'append':
        html = html + (input.content || '')
        break
      case 'prepend':
        html = (input.content || '') + html
        break
      case 'setAttribute':
        if (input.selector && input.attribute && input.value) {
          const attrRegex = new RegExp(`(<${input.selector})([^>]*)>`, 'gi')
          html = html.replace(attrRegex, `$1$2 ${input.attribute}="${input.value}">`)
        }
        break
      case 'addClass':
        if (input.selector && input.value) {
          const classRegex = new RegExp(`(<${input.selector}[^>]*class=["'])([^"']*)["']`, 'gi')
          html = html.replace(classRegex, `$1$2 ${input.value}"`)
        }
        break
      case 'removeClass':
        if (input.selector && input.value) {
          const classRegex = new RegExp(`(<${input.selector}[^>]*class=["'])([^"']*)["']`, 'gi')
          html = html.replace(
            classRegex,
            (_, pre, classes) =>
              `${pre}${classes.replace(new RegExp(`\\b${input.value}\\b`, 'g'), '').trim()}"`
          )
        }
        break
    }

    artifact.html = html
    artifact.updatedAt = new Date().toISOString()

    const saved = await saveArtifact(ctx.supabase, ctx.userId, input.noteId, artifacts)
    if (!saved) return { success: false, error: 'Failed to save' }

    return { success: true, data: { modifiedHtml: html } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function artifactModifyCss(
  input: ArtifactModifyCssInput,
  ctx: ToolContext
): Promise<ToolResult<{ modifiedCss: string }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const { artifact, artifacts } = result
    let css = artifact.css || ''

    switch (input.operation) {
      case 'replaceAll':
        css = input.newCss || ''
        break
      case 'addRule':
        if (input.selector && input.property && input.value) {
          css += `\n${input.selector} { ${input.property}: ${input.value}; }`
        }
        break
      case 'removeRule':
        if (input.selector) {
          const ruleRegex = new RegExp(
            `${input.selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`,
            'gi'
          )
          css = css.replace(ruleRegex, '').trim()
        }
        break
      case 'updateProperty':
        if (input.selector && input.property && input.value) {
          const rules = parseCssRules(css)
          const rule = rules.find((r) => r.selector === input.selector)
          if (rule) {
            rule.properties[input.property] = input.value
            // Reconstruct CSS
            css = rules
              .map(
                (r) =>
                  `${r.selector} { ${Object.entries(r.properties)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('; ')}; }`
              )
              .join('\n')
          } else {
            // Add new rule if selector doesn't exist
            css += `\n${input.selector} { ${input.property}: ${input.value}; }`
          }
        }
        break
    }

    artifact.css = css
    artifact.updatedAt = new Date().toISOString()

    const saved = await saveArtifact(ctx.supabase, ctx.userId, input.noteId, artifacts)
    if (!saved) return { success: false, error: 'Failed to save' }

    return { success: true, data: { modifiedCss: css } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function artifactModifyJs(
  input: ArtifactModifyJsInput,
  ctx: ToolContext
): Promise<ToolResult<{ modifiedJs: string }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const { artifact, artifacts } = result
    let js = artifact.js || ''

    switch (input.operation) {
      case 'replace':
        js = input.content
        break
      case 'append':
        js = js + '\n' + input.content
        break
      case 'prepend':
        js = input.content + '\n' + js
        break
      case 'wrapInFunction':
        if (input.functionName) {
          js = `function ${input.functionName}() {\n${input.content}\n}`
        } else {
          js = `(function() {\n${input.content}\n})();`
        }
        break
    }

    artifact.js = js
    artifact.updatedAt = new Date().toISOString()

    const saved = await saveArtifact(ctx.supabase, ctx.userId, input.noteId, artifacts)
    if (!saved) return { success: false, error: 'Failed to save' }

    return { success: true, data: { modifiedJs: js } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function artifactParseStructure(
  input: ArtifactParseStructureInput,
  ctx: ToolContext
): Promise<ToolResult<{ structure: ParsedHtmlStructure | null; elementCount: number }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const html = result.artifact.html || result.artifact.content || ''
    const structure = parseSimpleHtml(html, input.maxDepth)
    const elementCount = (html.match(/<\w+/g) || []).length

    return { success: true, data: { structure, elementCount } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function artifactGetCssRules(
  input: ArtifactGetCssRulesInput,
  ctx: ToolContext
): Promise<ToolResult<{ rules: CssRule[] }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const css = result.artifact.css || ''
    let rules = parseCssRules(css)

    if (input.selectorFilter) {
      rules = rules.filter((r) => r.selector.includes(input.selectorFilter!))
    }

    return { success: true, data: { rules } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function artifactValidate(
  input: ArtifactValidateInput,
  ctx: ToolContext
): Promise<ToolResult<{ valid: boolean; errors: { type: string; message: string }[] }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const errors: { type: string; message: string }[] = []
    const { artifact } = result

    // Validate HTML
    if (input.validateHtml && (artifact.html || artifact.content)) {
      const html = artifact.html || artifact.content || ''

      // Check for unclosed tags (simple check)
      const openTags = html.match(/<(\w+)(?:\s[^>]*)?(?<!\/)\>/g) || []
      const closeTags = html.match(/<\/(\w+)>/g) || []

      const selfClosing = [
        'br',
        'hr',
        'img',
        'input',
        'meta',
        'link',
        'area',
        'base',
        'col',
        'embed',
        'source',
        'track',
        'wbr',
      ]
      const openTagNames = openTags
        .map((t) => t.match(/<(\w+)/)?.[1]?.toLowerCase())
        .filter((t): t is string => t !== undefined && !selfClosing.includes(t))
      const closeTagNames = closeTags
        .map((t) => t.match(/<\/(\w+)>/)?.[1]?.toLowerCase())
        .filter((t): t is string => t !== undefined)

      if (openTagNames.length !== closeTagNames.length) {
        errors.push({ type: 'html', message: 'Mismatched open and close tags' })
      }
    }

    // Validate CSS
    if (input.validateCss && artifact.css) {
      const css = artifact.css

      // Check for unbalanced braces
      const openBraces = (css.match(/\{/g) || []).length
      const closeBraces = (css.match(/\}/g) || []).length

      if (openBraces !== closeBraces) {
        errors.push({
          type: 'css',
          message: `Unbalanced braces: ${openBraces} open, ${closeBraces} close`,
        })
      }

      // Check for invalid property syntax
      if (css.includes(';;')) {
        errors.push({ type: 'css', message: 'Double semicolons detected' })
      }
    }

    // Validate JS
    if (input.validateJs && artifact.js) {
      const js = artifact.js

      // Check for unbalanced braces/parens
      const openBraces = (js.match(/\{/g) || []).length
      const closeBraces = (js.match(/\}/g) || []).length
      const openParens = (js.match(/\(/g) || []).length
      const closeParens = (js.match(/\)/g) || []).length

      if (openBraces !== closeBraces) {
        errors.push({
          type: 'js',
          message: `Unbalanced curly braces: ${openBraces} open, ${closeBraces} close`,
        })
      }
      if (openParens !== closeParens) {
        errors.push({
          type: 'js',
          message: `Unbalanced parentheses: ${openParens} open, ${closeParens} close`,
        })
      }
    }

    return { success: true, data: { valid: errors.length === 0, errors } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ============================================================================
// New Tool Implementations (from Note3 migration)
// ============================================================================

interface JsFunction {
  name: string
  params: string[]
  async: boolean
  lineStart: number
}

/**
 * Extract JavaScript function names and signatures
 */
export async function artifactGetJsFunctions(
  input: ArtifactGetJsFunctionsInput,
  ctx: ToolContext
): Promise<ToolResult<{ functions: JsFunction[] }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const js = result.artifact.js || ''
    const functions: JsFunction[] = []

    // Match function declarations: function name(params) or async function name(params)
    const funcDeclRegex = /(?:^|\n)\s*(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g
    let match: RegExpExecArray | null
    let lineNum = 1

    while ((match = funcDeclRegex.exec(js)) !== null) {
      const beforeMatch = js.substring(0, match.index)
      lineNum = (beforeMatch.match(/\n/g) || []).length + 1

      functions.push({
        name: match[2],
        params: match[3]
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
        async: !!match[1],
        lineStart: lineNum,
      })
    }

    // Match arrow functions: const name = (params) => or const name = async (params) =>
    const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(?([^)=]*)\)?\s*=>/g
    while ((match = arrowRegex.exec(js)) !== null) {
      const beforeMatch = js.substring(0, match.index)
      lineNum = (beforeMatch.match(/\n/g) || []).length + 1

      functions.push({
        name: match[1],
        params: match[3]
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
        async: !!match[2],
        lineStart: lineNum,
      })
    }

    // Match method definitions in objects: name(params) { or name: function(params) {
    const methodRegex = /(\w+)\s*(?::\s*(?:async\s+)?function\s*)?\(([^)]*)\)\s*\{/g
    while ((match = methodRegex.exec(js)) !== null) {
      // Avoid duplicates from function declarations
      if (!functions.some((f) => f.name === match![1])) {
        const beforeMatch = js.substring(0, match.index)
        lineNum = (beforeMatch.match(/\n/g) || []).length + 1

        functions.push({
          name: match[1],
          params: match[2]
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean),
          async: js.substring(Math.max(0, match.index - 10), match.index).includes('async'),
          lineStart: lineNum,
        })
      }
    }

    return { success: true, data: { functions } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

interface Dependency {
  type: 'import' | 'cdn' | 'external'
  name: string
  source: string
  version?: string
}

/**
 * Extract dependencies from artifact (imports, CDN links, external resources)
 */
export async function artifactExtractDependencies(
  input: ArtifactExtractDependenciesInput,
  ctx: ToolContext
): Promise<ToolResult<{ dependencies: Dependency[] }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const dependencies: Dependency[] = []
    const { artifact } = result

    // Parse HTML for external resources
    const html = artifact.html || artifact.content || ''

    // Find CDN script sources
    const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["']/gi
    let match
    while ((match = scriptSrcRegex.exec(html)) !== null) {
      const src = match[1]
      if (src.includes('cdn') || src.startsWith('http')) {
        // Extract version from common CDN patterns
        const versionMatch = src.match(/@([\d.]+)|[/-]([\d.]+)(?:[./]|$)/)
        dependencies.push({
          type: 'cdn',
          name: extractLibraryName(src),
          source: src,
          version: versionMatch?.[1] || versionMatch?.[2],
        })
      }
    }

    // Find CSS link sources
    const linkHrefRegex = /<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi
    while ((match = linkHrefRegex.exec(html)) !== null) {
      const href = match[1]
      if (href.includes('cdn') || href.startsWith('http')) {
        dependencies.push({
          type: 'cdn',
          name: extractLibraryName(href),
          source: href,
        })
      }
    }

    // Parse JS for imports
    const js = artifact.js || ''

    // ES6 imports
    const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g
    while ((match = importRegex.exec(js)) !== null) {
      dependencies.push({
        type: 'import',
        name: match[1],
        source: match[1],
      })
    }

    // CommonJS requires
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((match = requireRegex.exec(js)) !== null) {
      dependencies.push({
        type: 'import',
        name: match[1],
        source: match[1],
      })
    }

    return { success: true, data: { dependencies } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

function extractLibraryName(url: string): string {
  // Extract library name from CDN URL
  const patterns = [
    /\/([^/@]+)@[\d.]+/, // npm CDN pattern: /library@version
    /\/([^/]+)\.min\./, // minified file pattern
    /\/([^/]+)-[\d.]+\./, // versioned file pattern
    /\/([^/]+)\.(?:js|css)$/, // simple file pattern
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  // Fallback: get filename without extension
  const parts = url.split('/')
  const filename = parts[parts.length - 1]
  return filename.replace(/\.(?:min\.)?(?:js|css)$/, '')
}

interface OptimizationResult {
  originalSize: number
  optimizedSize: number
  savings: number
  savingsPercent: number
  suggestions: string[]
}

/**
 * Optimize artifact code (minify/optimize)
 */
export async function artifactOptimize(
  input: ArtifactOptimizeInput,
  ctx: ToolContext
): Promise<ToolResult<OptimizationResult>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const { artifact, artifacts } = result
    const suggestions: string[] = []
    let originalSize = 0
    let optimizedSize = 0

    // Calculate original size
    originalSize += (artifact.html || artifact.content || '').length
    originalSize += (artifact.css || '').length
    originalSize += (artifact.js || '').length

    switch (input.type) {
      case 'size': {
        // Basic minification (whitespace removal)
        if (artifact.html) {
          artifact.html = artifact.html
            .replace(/>\s+</g, '><')
            .replace(/\s{2,}/g, ' ')
            .trim()
        }
        if (artifact.css) {
          artifact.css = artifact.css
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
            .replace(/\s*{\s*/g, '{')
            .replace(/\s*}\s*/g, '}')
            .replace(/\s*:\s*/g, ':')
            .replace(/\s*;\s*/g, ';')
            .replace(/;\}/g, '}')
            .trim()
        }
        if (artifact.js) {
          artifact.js = artifact.js
            .replace(/\/\/[^\n]*/g, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .replace(/\s{2,}/g, ' ')
            .trim()
        }
        suggestions.push('Removed whitespace and comments')
        break
      }

      case 'performance': {
        const js = artifact.js || ''
        const css = artifact.css || ''

        // Check for performance issues
        if (js.includes('document.querySelectorAll') && !js.includes('const ')) {
          suggestions.push('Consider caching DOM queries in variables')
        }
        if (js.includes('innerHTML') && js.includes('+=')) {
          suggestions.push('Avoid innerHTML += in loops, use DocumentFragment instead')
        }
        if (css.includes('*')) {
          suggestions.push('Avoid universal selector (*) for better CSS performance')
        }
        if (css.includes('!important')) {
          suggestions.push('Reduce use of !important for maintainable CSS')
        }
        if (js.includes('setTimeout') || js.includes('setInterval')) {
          suggestions.push('Consider using requestAnimationFrame for animations')
        }
        break
      }

      case 'a11y': {
        const html = artifact.html || artifact.content || ''

        // Check accessibility issues
        if (html.includes('<img') && !html.includes('alt=')) {
          suggestions.push('Add alt attributes to images for accessibility')
        }
        if (html.includes('<button') && !html.includes('aria-')) {
          suggestions.push('Consider adding ARIA labels to interactive elements')
        }
        if (!html.includes('role=') && html.includes('<div') && html.includes('onclick')) {
          suggestions.push('Add role="button" to clickable divs')
        }
        if (html.includes('<input') && !html.includes('<label')) {
          suggestions.push('Associate labels with form inputs')
        }
        if (html.includes('color:') && !html.includes('background')) {
          suggestions.push('Ensure sufficient color contrast for readability')
        }
        break
      }
    }

    // Calculate optimized size
    optimizedSize += (artifact.html || artifact.content || '').length
    optimizedSize += (artifact.css || '').length
    optimizedSize += (artifact.js || '').length

    artifact.updatedAt = new Date().toISOString()
    await saveArtifact(ctx.supabase, ctx.userId, input.noteId, artifacts)

    const savings = originalSize - optimizedSize
    const savingsPercent = originalSize > 0 ? Math.round((savings / originalSize) * 100) : 0

    return {
      success: true,
      data: {
        originalSize,
        optimizedSize,
        savings,
        savingsPercent,
        suggestions,
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

interface ColorInfo {
  value: string
  format: 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'named'
  usageCount: number
  selectors: string[]
}

/**
 * Extract color palette from artifact CSS
 */
export async function artifactGetColors(
  input: ArtifactGetColorsInput,
  ctx: ToolContext
): Promise<ToolResult<{ colors: ColorInfo[] }>> {
  try {
    const result = await getArtifact(ctx.supabase, ctx.userId, input.noteId, input.artifactId)
    if (!result) return { success: false, error: 'Artifact not found' }

    const css = result.artifact.css || ''
    const colorMap = new Map<string, ColorInfo>()

    // Named colors
    const namedColors = [
      'black',
      'white',
      'red',
      'green',
      'blue',
      'yellow',
      'orange',
      'purple',
      'pink',
      'gray',
      'grey',
      'cyan',
      'magenta',
      'lime',
      'navy',
      'teal',
      'aqua',
      'fuchsia',
      'silver',
      'maroon',
      'olive',
      'transparent',
    ]

    // Parse CSS rules to get selectors and their colors
    const ruleRegex = /([^{]+)\{([^}]+)\}/g
    let ruleMatch

    while ((ruleMatch = ruleRegex.exec(css)) !== null) {
      const selector = ruleMatch[1].trim()
      const properties = ruleMatch[2]

      // Hex colors
      const hexRegex = /#([0-9a-fA-F]{3,8})\b/g
      let colorMatch
      while ((colorMatch = hexRegex.exec(properties)) !== null) {
        const color = colorMatch[0].toLowerCase()
        addColor(colorMap, color, 'hex', selector)
      }

      // RGB/RGBA colors
      const rgbRegex = /rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/gi
      while ((colorMatch = rgbRegex.exec(properties)) !== null) {
        const color = colorMatch[0].toLowerCase().replace(/\s/g, '')
        const format = color.startsWith('rgba') ? 'rgba' : 'rgb'
        addColor(colorMap, color, format, selector)
      }

      // HSL/HSLA colors
      const hslRegex = /hsla?\s*\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?(?:\s*,\s*[\d.]+)?\s*\)/gi
      while ((colorMatch = hslRegex.exec(properties)) !== null) {
        const color = colorMatch[0].toLowerCase().replace(/\s/g, '')
        const format = color.startsWith('hsla') ? 'hsla' : 'hsl'
        addColor(colorMap, color, format, selector)
      }

      // Named colors
      for (const namedColor of namedColors) {
        const namedRegex = new RegExp(`\\b${namedColor}\\b`, 'gi')
        if (namedRegex.test(properties)) {
          addColor(colorMap, namedColor, 'named', selector)
        }
      }
    }

    // Convert map to array and sort by usage count
    const colors = Array.from(colorMap.values()).sort((a, b) => b.usageCount - a.usageCount)

    return { success: true, data: { colors } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

function addColor(
  colorMap: Map<string, ColorInfo>,
  value: string,
  format: ColorInfo['format'],
  selector: string
): void {
  const existing = colorMap.get(value)
  if (existing) {
    existing.usageCount++
    if (!existing.selectors.includes(selector)) {
      existing.selectors.push(selector)
    }
  } else {
    colorMap.set(value, {
      value,
      format,
      usageCount: 1,
      selectors: [selector],
    })
  }
}

// ============================================================================
// Tool Definitions for LangGraph
// ============================================================================

export const artifactTools = [
  {
    name: 'artifact_modify_html',
    description: 'Modify HTML content of an artifact',
    schema: ArtifactModifyHtmlSchema,
    execute: artifactModifyHtml,
  },
  {
    name: 'artifact_modify_css',
    description: 'Modify CSS styles of an artifact',
    schema: ArtifactModifyCssSchema,
    execute: artifactModifyCss,
  },
  {
    name: 'artifact_modify_js',
    description: 'Modify JavaScript code of an artifact',
    schema: ArtifactModifyJsSchema,
    execute: artifactModifyJs,
  },
  {
    name: 'artifact_parse_structure',
    description: 'Parse and analyze the HTML structure of an artifact',
    schema: ArtifactParseStructureSchema,
    execute: artifactParseStructure,
  },
  {
    name: 'artifact_get_css_rules',
    description: 'Extract CSS rules from an artifact',
    schema: ArtifactGetCssRulesSchema,
    execute: artifactGetCssRules,
  },
  {
    name: 'artifact_validate',
    description: 'Validate HTML/CSS/JS syntax of an artifact',
    schema: ArtifactValidateSchema,
    execute: artifactValidate,
  },
  // New tools from Note3 migration
  {
    name: 'artifact_get_js_functions',
    description: 'Parse JavaScript AST to extract function names and signatures',
    schema: ArtifactGetJsFunctionsSchema,
    execute: artifactGetJsFunctions,
  },
  {
    name: 'artifact_extract_dependencies',
    description: 'Find imports, CDN links, and external resources',
    schema: ArtifactExtractDependenciesSchema,
    execute: artifactExtractDependencies,
  },
  {
    name: 'artifact_optimize',
    description: 'Minify/optimize code for size, performance, or accessibility',
    schema: ArtifactOptimizeSchema,
    execute: artifactOptimize,
  },
  {
    name: 'artifact_get_colors',
    description: 'Extract color palette from CSS',
    schema: ArtifactGetColorsSchema,
    execute: artifactGetColors,
  },
] as const
