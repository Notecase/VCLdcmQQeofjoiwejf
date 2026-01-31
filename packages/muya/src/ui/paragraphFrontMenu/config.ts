import type Parent from '../../block/base/parent'
import type { IQuickInsertMenuItem } from '../paragraphQuickInsertMenu/config'
import copyIcon from '../../assets/icons/copy/2.png'
import deleteIcon from '../../assets/icons/delete/2.png'
import newIcon from '../../assets/icons/paragraph/2.png'
import turnIntoIcon from '../../assets/icons/turninto/2.png'
import { isOsx } from '../../config'
import { MENU_CONFIG } from '../paragraphQuickInsertMenu/config'

const ALL_MENU_CONFIG = MENU_CONFIG.reduce(
  (acc, section) => [...acc, ...section.children],
  [] as IQuickInsertMenuItem['children']
)

const COMMAND_KEY = isOsx ? '⌘' : '⌃'

export const FRONT_MENU = [
  {
    icon: copyIcon,
    label: 'duplicate',
    text: 'Duplicate',
    shortCut: `⇧${COMMAND_KEY}P`,
  },
  {
    icon: turnIntoIcon,
    label: 'turnInto',
    text: 'Turn Into',
    shortCut: '', // No shortcut, has submenu
  },
  {
    icon: newIcon,
    label: 'new',
    text: 'New Paragraph',
    shortCut: `⇧${COMMAND_KEY}N`,
  },
  {
    icon: deleteIcon,
    label: 'delete',
    text: 'Delete',
    shortCut: `⇧${COMMAND_KEY}D`,
  },
]

export type FrontMenuIcon = (typeof FRONT_MENU)[number]

/**
 * Get the current block's label for highlighting in submenu
 */
export function getBlockLabel(block: Parent): string {
  const { blockName } = block

  switch (blockName) {
    case 'paragraph':
      return 'paragraph'
    case 'atx-heading': {
      const level = (block as any).meta?.level || 1
      return `atx-heading ${level}`
    }
    case 'order-list':
      return 'order-list'
    case 'bullet-list':
      return 'bullet-list'
    case 'task-list':
      return 'task-list'
    case 'block-quote':
      return 'block-quote'
    case 'code-block':
      return 'code-block'
    case 'math-block':
      return 'math-block'
    case 'html-block':
      return 'html-block'
    case 'table':
      return 'table'
    case 'thematic-break':
      return 'thematic-break'
    case 'frontmatter':
      return 'frontmatter'
    default:
      return 'paragraph'
  }
}

/**
 * Get available submenu items based on block type
 */
export function getSubMenu(block: Parent): IQuickInsertMenuItem['children'] {
  const { blockName } = block

  switch (blockName) {
    case 'paragraph': {
      const paragraphIsEmpty = /^\s*$/.test(block.firstContentInDescendant()!.text)
      if (paragraphIsEmpty) {
        // Empty paragraph can turn into anything except frontmatter and hr
        return ALL_MENU_CONFIG.filter((item) => !/frontmatter|thematic-break/.test(item.label))
      }
      // Non-empty paragraph can only turn into certain types
      return ALL_MENU_CONFIG.filter((item) =>
        /paragraph|atx-heading|block-quote|order-list|bullet-list|task-list/.test(item.label)
      )
    }

    case 'atx-heading': {
      return ALL_MENU_CONFIG.filter((item) => /atx-heading|paragraph/.test(item.label))
    }

    case 'order-list':
    case 'bullet-list':
    case 'task-list': {
      return ALL_MENU_CONFIG.filter((item) => /order-list|bullet-list|task-list/.test(item.label))
    }

    default:
      return []
  }
}
