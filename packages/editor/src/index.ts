// @inkdown/editor - Muya markdown editor

// Main editor class will be exported after Muya migration
// For now, re-export placeholder

export interface EditorOptions {
  markdown?: string
  autoPairBracket?: boolean
  autoPairMarkdownSyntax?: boolean
  autoPairQuote?: boolean
  bulletListMarker?: '-' | '*' | '+'
  codeBlockLineNumbers?: boolean
  hideQuickInsertHint?: boolean
  hideLinkPopup?: boolean
  listIndentation?: number | 'dfm'
  orderListDelimiter?: '.' | ')'
  preferLooseListItem?: boolean
  spellcheckEnabled?: boolean
  sequenceTheme?: 'hand' | 'simple'
  tabSize?: number
  trimUnnecessaryCodeBlockEmptyLines?: boolean
  mermaidTheme?: 'default' | 'dark' | 'forest' | 'neutral'
  vegaTheme?: 'latimes' | 'dark' | 'excel' | 'fivethirtyeight'
}

export interface EditorEventMap {
  'change': { markdown: string; wordCount: { words: number; characters: number; paragraphs: number } }
  'selection-change': { anchor: any; focus: any }
  'stateChange': { name: string; value: any }
  'toc-change': { toc: any[] }
}

// Export types for now, actual Muya will be copied
export type { EditorOptions as MuyaOptions }
