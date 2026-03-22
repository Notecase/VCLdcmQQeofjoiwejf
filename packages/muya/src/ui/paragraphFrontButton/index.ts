import type { ReferenceElement } from '@floating-ui/dom'
import type { VNode } from 'snabbdom'
import type Parent from '../../block/base/parent'
import type { Muya } from '../../index'
import type { IBaseOptions } from '../types'
import { autoUpdate, computePosition, flip, offset } from '@floating-ui/dom'

import BulletList from '../../block/commonMark/bulletList'
import OrderList from '../../block/commonMark/orderList'
import { h, patch } from '../../utils/snabbdom'
import { getIcon } from './config'

import './index.css'

const FRONT_CONTROLS_CLASS = 'mu-front-controls-enabled'

function defaultOptions() {
  return {
    placement: 'left-start' as const,
    offsetOptions: {
      mainAxis: 0,
      crossAxis: 0,
      alignmentAxis: 10,
    },
    showArrow: false,
  }
}

function renderIcon(iconSrc: string) {
  return h(
    'i.icon',
    h(
      'i.icon-inner',
      {
        style: {
          // Use mask-image for cross-browser colored icons
          '-webkit-mask-image': `url(${iconSrc})`,
          'mask-image': `url(${iconSrc})`,
        },
      },
      ''
    )
  )
}

function isOrderOrBulletList(block: Parent): block is OrderList | BulletList {
  return block instanceof OrderList || block instanceof BulletList
}

export class ParagraphFrontButton {
  public name: string = 'mu-front-button'
  public resizeObserver: ResizeObserver | null = null
  private _options: IBaseOptions
  private _block: Parent | null = null
  private _oldVNode: VNode | null = null
  private _status: boolean = false
  private _floatBox: HTMLDivElement = document.createElement('div')
  private _container: HTMLDivElement = document.createElement('div')
  private _iconWrapper: HTMLDivElement = document.createElement('div')
  private _cleanup: (() => void) | null = null

  constructor(
    public muya: Muya,
    options = {}
  ) {
    this._options = Object.assign({}, defaultOptions(), options)
    this.init()
    this.listen()
  }

  init() {
    const { _floatBox: floatBox, _container: container, _iconWrapper: iconWrapper } = this
    // Use to remember which float container is shown.
    container.classList.add(this.name)
    container.appendChild(iconWrapper)
    floatBox.classList.add('mu-front-button-wrapper')
    floatBox.appendChild(container)
    document.body.appendChild(floatBox)

    // Since the size of the container is not fixed and changes according to the change of content,
    // the floatBox needs to set the size according to the container size
    const resizeObserver = (this.resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to avoid "ResizeObserver loop completed" warning
      requestAnimationFrame(() => {
        const { offsetWidth, offsetHeight } = container

        Object.assign(floatBox.style, {
          width: `${offsetWidth}px`,
          height: `${offsetHeight}px`,
        })

        // Position will be updated by autoUpdate
      })
    }))

    resizeObserver.observe(container)
  }

  private isFrontControlsEnabled() {
    return this.muya.domNode.classList.contains(FRONT_CONTROLS_CLASS)
  }

  private isBlockFromCurrentEditor(block: Parent | null) {
    return Boolean(block?.domNode && this.muya.domNode.contains(block.domNode))
  }

  listen() {
    const { _container: container } = this
    const { eventCenter } = this.muya

    const clickHandler = () => {
      if (!this.isFrontControlsEnabled()) return
      if (!this.isBlockFromCurrentEditor(this._block)) return
      eventCenter.emit('muya-front-menu', {
        reference: {
          getBoundingClientRect: () => container.getBoundingClientRect(),
        },
        block: this._block,
      })
    }

    // Show front button when selection changes (user clicks/focuses a block)
    eventCenter.subscribe('selection-change', () => {
      if (!this.isFrontControlsEnabled()) {
        this.hide()
        return
      }
      // Read from selection state directly — the event payload may have undefined anchorBlock
      // when callers use `block` shorthand instead of `anchorBlock`
      const anchorBlock = this.muya.editor.selection.anchorBlock
      const block = anchorBlock?.outMostBlock
      if (block && this.isBlockFromCurrentEditor(block) && block.domNode?.isConnected) {
        if (this._block !== block) {
          this.show(block)
          this.render()
        }
      } else {
        this.hide()
      }
    })

    // Hide on scroll so button doesn't float around during scrolling
    // Use domNode itself — it has overflow-y: auto via .muya-editor CSS
    const scrollContainer = this.muya.domNode
    if (scrollContainer) {
      eventCenter.attachDOMEvent(scrollContainer, 'scroll', () => {
        this.hide()
      })
    }

    eventCenter.attachDOMEvent(container, 'click', clickHandler)
  }

  render() {
    const {
      _container: container,
      _iconWrapper: iconWrapper,
      _block: block,
      _oldVNode: oldVNode,
    } = this

    const iconWrapperSelector = 'div.mu-icon-wrapper'
    const iconSrc = getIcon(block!)
    const iconVNode = renderIcon(iconSrc)

    const vnode = h(iconWrapperSelector, [iconVNode])

    if (oldVNode) patch(oldVNode, vnode)
    else patch(iconWrapper, vnode)

    this._oldVNode = vnode

    // Reset float box style height
    const { lineHeight } = getComputedStyle(block!.domNode!)
    container.style.height = lineHeight
  }

  hide() {
    if (!this._status) return

    this._block = null
    this._status = false
    const { eventCenter } = this.muya
    if (this._cleanup) {
      this._cleanup()
      this._cleanup = null
    }

    if (this._floatBox) {
      Object.assign(this._floatBox.style, {
        left: `-9999px`,
        top: `-9999px`,
        opacity: '0',
      })
    }

    eventCenter.emit('muya-float-button', this, false)
  }

  show(block: Parent) {
    if (!this.isFrontControlsEnabled() || !this.isBlockFromCurrentEditor(block)) {
      this.hide()
      return
    }

    if (this._block && this._block === block) return

    this._block = block
    const { domNode } = block
    const { _floatBox: floatBox } = this
    const { placement } = this._options
    const { eventCenter } = this.muya

    if (this._cleanup) {
      this._cleanup()
      this._cleanup = null
    }

    const styles = window.getComputedStyle(domNode!)
    const paddingTop = Number.parseFloat(styles.paddingTop)

    // For placement: 'left-start':
    //   mainAxis  = horizontal gap from block edge (keep small & fixed)
    //   alignmentAxis = vertical offset from block top (use paddingTop to align with first text line)
    const isLooseList = isOrderOrBulletList(block) && block.meta.loose
    const verticalOffset = isLooseList ? paddingTop * 2 : paddingTop

    const updatePosition = () => {
      computePosition(domNode! as Element | ReferenceElement, floatBox, {
        placement,
        middleware: [
          offset({
            mainAxis: 4,
            crossAxis: 0,
            alignmentAxis: verticalOffset,
          }),
          flip(),
        ],
      }).then(({ x, y }) => {
        Object.assign(floatBox.style, {
          left: `${x}px`,
          top: `${y}px`,
          opacity: 1,
        })
      })
    }

    updatePosition()
    this._cleanup = autoUpdate(domNode! as Element | ReferenceElement, floatBox, updatePosition)

    this._status = true
    eventCenter.emit('muya-float-button', this, true)
  }

  destroy() {
    if (this._container && this.resizeObserver) this.resizeObserver.unobserve(this._container)

    if (this._cleanup) {
      this._cleanup()
      this._cleanup = null
    }

    this._floatBox.remove()
  }
}
