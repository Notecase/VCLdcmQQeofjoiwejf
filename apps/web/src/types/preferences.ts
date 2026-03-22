// User preferences that sync with Supabase
export interface UserPreferences {
  // Theme
  theme: ThemeName

  // Editor appearance
  fontSize: number
  lineHeight: number
  editorFontFamily?: string
  codeFontFamily?: string
  codeFontSize: number
  editorLineWidth: string

  // Editor behavior
  autoSave: boolean
  autoSaveDelay: number
  typewriter: boolean
  focus: boolean
  sourceCode: boolean

  // Markdown settings
  preferLooseListItem: boolean
  bulletListMarker: '-' | '*' | '+'
  orderListDelimiter: '.' | ')'
  tabSize: number
  listIndentation: number | 'dfm'

  // Features
  autoPairBracket: boolean
  autoPairMarkdownSyntax: boolean
  autoPairQuote: boolean
  hideQuickInsertHint: boolean
  hideLinkPopup: boolean

  // Code blocks
  codeBlockLineNumbers: boolean
  trimUnnecessaryCodeBlockEmptyLines: boolean

  // Diagram themes
  sequenceTheme: 'hand' | 'simple'

  // UI
  showTabBar: boolean
  textDirection: 'ltr' | 'rtl'
  hideToolbar: boolean
}

export type ThemeName =
  | 'light'
  | 'dark'
  | 'one-dark'
  | 'material-dark'
  | 'ulysses-light'
  | 'graphite-light'
  | 'cadmium-light'

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'one-dark',
  fontSize: 16,
  lineHeight: 1.5,
  codeFontSize: 14,
  editorLineWidth: '100%',

  autoSave: true,
  autoSaveDelay: 5000,
  typewriter: false,
  focus: false,
  sourceCode: false,

  preferLooseListItem: true,
  bulletListMarker: '-',
  orderListDelimiter: '.',
  tabSize: 4,
  listIndentation: 1,

  autoPairBracket: true,
  autoPairMarkdownSyntax: true,
  autoPairQuote: true,
  hideQuickInsertHint: false,
  hideLinkPopup: false,

  codeBlockLineNumbers: false,
  trimUnnecessaryCodeBlockEmptyLines: true,

  sequenceTheme: 'hand',

  showTabBar: true,
  textDirection: 'ltr',
  hideToolbar: false,
}
