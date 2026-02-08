import {
  Muya,
  ParagraphFrontButton,
  ParagraphFrontMenu,
  ParagraphQuickInsertMenu,
  CodeBlockLanguageSelector,
  EmojiSelector,
  ImageToolBar,
  ImageResizeBar,
  InlineFormatToolbar,
  TableColumnToolbar,
  TableRowColumMenu,
  TableDragBar,
  TablePicker,
  LinkTools,
  FootnoteTool,
} from '@inkdown/muya'
import { openExternal } from './platform'

export interface RegisterMuyaPluginsOptions {
  frontControls?: boolean
}

let basePluginsRegistered = false
let frontPluginsRegistered = false

/**
 * Register Muya plugins once per app runtime.
 * Front controls are opt-in because AI Home surfaces hide/disable them.
 */
export function registerMuyaPlugins(options: RegisterMuyaPluginsOptions = {}): void {
  const { frontControls = false } = options

  if (!basePluginsRegistered) {
    Muya.use(ParagraphQuickInsertMenu)
    Muya.use(CodeBlockLanguageSelector)
    Muya.use(EmojiSelector)
    Muya.use(ImageToolBar)
    Muya.use(ImageResizeBar)
    Muya.use(InlineFormatToolbar)
    Muya.use(TablePicker)
    Muya.use(TableColumnToolbar)
    Muya.use(TableRowColumMenu)
    Muya.use(TableDragBar)
    Muya.use(LinkTools, {
      jumpClick: (linkInfo: { href: string }) => {
        openExternal(linkInfo.href)
      },
    })
    Muya.use(FootnoteTool)

    basePluginsRegistered = true
  }

  if (frontControls && !frontPluginsRegistered) {
    Muya.use(ParagraphFrontButton)
    Muya.use(ParagraphFrontMenu)
    frontPluginsRegistered = true
  }
}
