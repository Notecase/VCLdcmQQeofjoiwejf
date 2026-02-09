import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParagraphFrontButton } from './paragraphFrontButton'
import { ParagraphFrontMenu } from './paragraphFrontMenu'

type EventCenterStub = {
  attachDOMEvent: (target: EventTarget, type: string, handler: EventListener) => void
  emit: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

function createEventCenter(): EventCenterStub {
  return {
    attachDOMEvent: (target, type, handler) => {
      target.addEventListener(type, handler)
    },
    emit: vi.fn(),
    subscribe: vi.fn(),
  }
}

function createMuyaStub(frontEnabled: boolean) {
  const host = document.createElement('div')
  const editor = document.createElement('div')
  if (frontEnabled) {
    editor.classList.add('mu-front-controls-enabled')
  }
  host.appendChild(editor)
  document.body.appendChild(host)

  const eventCenter = createEventCenter()

  return {
    muya: {
      domNode: editor,
      eventCenter,
      i18n: { t: (text: string) => text },
      editor: {
        contentState: {
          removeBlocks: vi.fn(),
          insertBefore: vi.fn(),
          insertAfter: vi.fn(),
          partialRender: vi.fn(),
          cursor: { start: { key: '', offset: 0 }, end: { key: '', offset: 0 } },
        },
      },
    },
    cleanup: () => {
      host.remove()
    },
  }
}

describe('Muya front controls gating', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('prevents ParagraphFrontButton from showing when editor is not opted in', () => {
    const { muya, cleanup } = createMuyaStub(false)
    const button = new ParagraphFrontButton(muya as any)
    const blockNode = document.createElement('p')
    blockNode.textContent = 'Block'
    muya.domNode.appendChild(blockNode)

    button.show({ domNode: blockNode, isOutMostBlock: true } as any)

    expect((button as any)._status).toBe(false)

    button.destroy()
    cleanup()
  })

  it('allows ParagraphFrontButton to show when editor is opted in', () => {
    const { muya, cleanup } = createMuyaStub(true)
    const button = new ParagraphFrontButton(muya as any)
    const blockNode = document.createElement('p')
    blockNode.textContent = 'Block'
    muya.domNode.appendChild(blockNode)

    button.show({ domNode: blockNode, isOutMostBlock: true } as any)

    expect((button as any)._status).toBe(true)

    button.destroy()
    cleanup()
  })

  it('prevents ParagraphFrontMenu from showing when editor is not opted in', () => {
    const { muya, cleanup } = createMuyaStub(false)
    const menu = new ParagraphFrontMenu(muya as any)
    const blockNode = document.createElement('p')
    blockNode.textContent = 'Block'
    muya.domNode.appendChild(blockNode)
    ;(menu as any).block = { domNode: blockNode, blockName: 'paragraph' }

    menu.show({
      getBoundingClientRect: () => new DOMRect(0, 0, 20, 20),
    } as any)

    expect(menu.status).toBe(false)

    menu.destroy()
    cleanup()
  })

  it('allows ParagraphFrontMenu to show when editor is opted in', () => {
    const { muya, cleanup } = createMuyaStub(true)
    const menu = new ParagraphFrontMenu(muya as any)
    const blockNode = document.createElement('p')
    blockNode.textContent = 'Block'
    muya.domNode.appendChild(blockNode)
    ;(menu as any).block = { domNode: blockNode, blockName: 'paragraph' }

    menu.show({
      getBoundingClientRect: () => new DOMRect(0, 0, 20, 20),
    } as any)

    expect(menu.status).toBe(true)

    menu.destroy()
    cleanup()
  })
})
