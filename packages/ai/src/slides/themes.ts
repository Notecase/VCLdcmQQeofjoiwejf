/**
 * Slide Themes
 *
 * Visual theme definitions for AI-generated educational slides.
 * Ported from Note3's geminiService.ts
 */

// ============================================================================
// Types
// ============================================================================

export interface SlideTheme {
  name: string
  displayName: string
  description: string
  primaryColor: string
  accentColor: string
  backgroundTexture: string
  textColor: string
  secondaryTextColor: string
}

// ============================================================================
// Theme Definitions
// ============================================================================

export const THEMES: Record<string, SlideTheme> = {
  'Technical/Engineering': {
    name: 'Technical/Engineering',
    displayName: 'Technical',
    description: 'Professional engineering aesthetic with grid patterns and precise lines',
    primaryColor: '#001f3f',
    accentColor: '#FFD700',
    backgroundTexture: 'Clean light background with subtle engineering grid pattern',
    textColor: '#1a1a2e',
    secondaryTextColor: '#4a4a6a',
  },

  'Organic/Biological': {
    name: 'Organic/Biological',
    displayName: 'Organic',
    description: 'Natural, flowing aesthetic inspired by biological systems',
    primaryColor: '#2d5a27',
    accentColor: '#8fbc8f',
    backgroundTexture: 'Soft cream background with organic flowing patterns',
    textColor: '#1a2f1a',
    secondaryTextColor: '#3d5a3d',
  },

  'History/Paper': {
    name: 'History/Paper',
    displayName: 'Historical',
    description: 'Vintage paper aesthetic with aged textures and classic typography',
    primaryColor: '#5c4033',
    accentColor: '#8b7355',
    backgroundTexture: 'Aged paper texture with subtle sepia tones',
    textColor: '#3d2914',
    secondaryTextColor: '#6b4423',
  },

  'Modern/Abstract': {
    name: 'Modern/Abstract',
    displayName: 'Modern',
    description: 'Contemporary minimalist design with bold geometric shapes',
    primaryColor: '#2c3e50',
    accentColor: '#3498db',
    backgroundTexture: 'Clean white background with subtle geometric accents',
    textColor: '#1a252f',
    secondaryTextColor: '#5d6d7e',
  },
}

// ============================================================================
// Theme List for UI
// ============================================================================

export const THEME_LIST: SlideTheme[] = Object.values(THEMES)

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a theme by name
 */
export function getTheme(name: string): SlideTheme {
  return THEMES[name] || THEMES['Technical/Engineering']
}

/**
 * Get the default theme
 */
export function getDefaultTheme(): SlideTheme {
  return THEMES['Technical/Engineering']
}

/**
 * Get theme names for select dropdowns
 */
export function getThemeNames(): string[] {
  return Object.keys(THEMES)
}

/**
 * Detect theme based on content
 */
export function detectTheme(content: string): SlideTheme {
  const lowercaseContent = content.toLowerCase()

  // Technical keywords
  if (
    lowercaseContent.includes('algorithm') ||
    lowercaseContent.includes('architecture') ||
    lowercaseContent.includes('system') ||
    lowercaseContent.includes('code') ||
    lowercaseContent.includes('api') ||
    lowercaseContent.includes('database')
  ) {
    return THEMES['Technical/Engineering']
  }

  // Biology/Science keywords
  if (
    lowercaseContent.includes('cell') ||
    lowercaseContent.includes('biology') ||
    lowercaseContent.includes('organism') ||
    lowercaseContent.includes('evolution') ||
    lowercaseContent.includes('ecosystem')
  ) {
    return THEMES['Organic/Biological']
  }

  // History keywords
  if (
    lowercaseContent.includes('history') ||
    lowercaseContent.includes('century') ||
    lowercaseContent.includes('ancient') ||
    lowercaseContent.includes('war') ||
    lowercaseContent.includes('civilization')
  ) {
    return THEMES['History/Paper']
  }

  // Default to modern
  return THEMES['Modern/Abstract']
}

// Type aliases for compatibility
export type ThemeName = keyof typeof THEMES

// ============================================================================
// Slide Type Definitions
// ============================================================================

export type SlideType = 'architecture' | 'concept' | 'process' | 'graph' | 'comparison' | 'overview'

export interface SlideTypeInfo {
  type: SlideType
  displayName: string
  description: string
  icon: string
}

export const SLIDE_TYPES: Record<SlideType, SlideTypeInfo> = {
  architecture: {
    type: 'architecture',
    displayName: 'Architecture',
    description: 'System diagrams and structural layouts',
    icon: 'layout',
  },
  concept: {
    type: 'concept',
    displayName: 'Concept',
    description: 'Key concepts and definitions',
    icon: 'lightbulb',
  },
  process: {
    type: 'process',
    displayName: 'Process',
    description: 'Flow diagrams and step-by-step guides',
    icon: 'git-branch',
  },
  graph: {
    type: 'graph',
    displayName: 'Graph',
    description: 'Data visualizations and charts',
    icon: 'bar-chart-2',
  },
  comparison: {
    type: 'comparison',
    displayName: 'Comparison',
    description: 'Side-by-side comparisons and tables',
    icon: 'columns',
  },
  overview: {
    type: 'overview',
    displayName: 'Overview',
    description: 'High-level summaries and introductions',
    icon: 'eye',
  },
}

export const SLIDE_TYPE_LIST: SlideTypeInfo[] = Object.values(SLIDE_TYPES)
