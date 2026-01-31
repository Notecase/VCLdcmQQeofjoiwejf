import type { ReferenceElement } from '@floating-ui/dom'
import type { VNode } from 'snabbdom'
import type { Muya } from '../../index'
import type { IBaseOptions } from '../types'

import WarningIcon from '../../assets/icons/warning/2.png'
import { h, patch } from '../../utils/snabbdom'
import BaseFloat from '../baseFloat'

import './index.css'

interface FootnoteBlock {
  key?: string
  text?: string
  children: FootnoteBlock[]
}

interface FootnoteToolPayload {
  reference: ReferenceElement | null
  identifier: string
  footnotes: Map<string, FootnoteBlock>
}

function getFootnoteText(block: FootnoteBlock) {
  let text = ''
  const travel = (block: FootnoteBlock) => {
    if (block.children.length === 0 && block.text) {
      text += block.text
    } else if (block.children.length) {
      for (const b of block.children) travel(b)
    }
  }

  const blocks = block.children.slice(1)

  for (const b of blocks) travel(b)

  return text
}

const defaultOptions: IBaseOptions = {
  placement: 'bottom',
  offsetOptions: {
    mainAxis: 5,
    crossAxis: 0,
    alignmentAxis: 0,
  },
  showArrow: false,
}

class FootnoteTool extends BaseFloat {
  static pluginName = 'footnoteTool'

  private _oldVNode: VNode | null = null
  private _identifier: string | null = null
  private _footnotes: Map<string, FootnoteBlock> | null = null
  private _hideTimer: ReturnType<typeof setTimeout> | null = null
  private _toolContainer: HTMLDivElement = document.createElement('div')
  public override options: IBaseOptions

  constructor(muya: Muya, options: Partial<IBaseOptions> = {}) {
    const name = 'mu-footnote-tool'
    const opts: IBaseOptions = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.options = opts
    this.container!.appendChild(this._toolContainer)
    this.floatBox!.classList.add('mu-footnote-tool-container')
    this.listen()
  }

  override listen() {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe(
      'muya-footnote-tool',
      ({ reference, identifier, footnotes }: FootnoteToolPayload) => {
        if (reference) {
          this._footnotes = footnotes
          this._identifier = identifier
          setTimeout(() => {
            this.show(reference)
            this.render()
          }, 0)
        } else {
          if (this._hideTimer) clearTimeout(this._hideTimer)

          this._hideTimer = setTimeout(() => {
            this.hide()
          }, 500)
        }
      }
    )

    const mouseOverHandler = () => {
      if (this._hideTimer) clearTimeout(this._hideTimer)
    }

    const mouseOutHandler = () => {
      this.hide()
    }

    eventCenter.attachDOMEvent(this.container!, 'mouseover', mouseOverHandler)
    eventCenter.attachDOMEvent(this.container!, 'mouseleave', mouseOutHandler)
  }

  render() {
    const {
      _oldVNode: oldVNode,
      _toolContainer: toolContainer,
      _identifier: identifier,
      _footnotes: footnotes,
    } = this
    if (!identifier || !footnotes) return

    const hasFootnote = footnotes.has(identifier)
    const iconWrapperSelector = 'div.icon-wrapper'
    const icon = h(
      'i.icon',
      h(
        'i.icon-inner',
        {
          style: {
            // Use mask-image for cross-browser colored icons
            '-webkit-mask-image': `url(${WarningIcon})`,
            'mask-image': `url(${WarningIcon})`,
          },
        },
        ''
      )
    )
    const iconWrapper = h(iconWrapperSelector, icon)
    let text = "Can't find footnote with syntax [^abc]:"
    if (hasFootnote) {
      const footnoteBlock = footnotes.get(identifier)

      text = getFootnoteText(footnoteBlock!)
      if (!text) text = 'Input the footnote definition...'
    }
    const textNode = h('span.text', text)
    const button = h(
      'a.btn',
      {
        on: {
          click: (event) => {
            this.buttonClick(event, hasFootnote)
          },
        },
      },
      hasFootnote ? 'Go to' : 'Create'
    )
    const children = [textNode, button]
    if (!hasFootnote) children.unshift(iconWrapper)

    const vnode = h('div', children)

    if (oldVNode) patch(oldVNode, vnode)
    else patch(toolContainer, vnode)

    this._oldVNode = vnode
  }

  buttonClick(event: MouseEvent, hasFootnote: boolean) {
    event.preventDefault()
    event.stopPropagation()
    const { _identifier: identifier, _footnotes: footnotes } = this
    if (!identifier || !footnotes) return this.hide()

    if (hasFootnote) {
      const block = footnotes.get(identifier)
      const key = block?.key
      const ele = key ? document.querySelector<HTMLElement>(`#${key}`) : null
      ele?.scrollIntoView({ behavior: 'smooth' })
    } else {
      this.muya.eventCenter.emit('muya-create-footnote', { identifier })
    }

    return this.hide()
  }
}

export default FootnoteTool
