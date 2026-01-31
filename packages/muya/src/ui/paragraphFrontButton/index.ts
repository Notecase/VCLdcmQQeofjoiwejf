import type { ReferenceElement } from '@floating-ui/dom'
import type { VNode } from 'snabbdom'
import type Parent from '../../block/base/parent'
import type { Muya } from '../../index'
import type { IBaseOptions } from '../types'
import { autoUpdate, computePosition, flip, offset } from '@floating-ui/dom'

import BulletList from '../../block/commonMark/bulletList'
import OrderList from '../../block/commonMark/orderList'
import { BLOCK_DOM_PROPERTY } from '../../config'
import { throttle } from '../../utils'
import { h, patch } from '../../utils/snabbdom'
import { getIcon } from './config'

import './index.css'

const LEFT_OFFSET = 100

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

  listen() {
    const { _container: container } = this
    const { eventCenter } = this.muya

    const mousemoveHandler = throttle((event: MouseEvent) => {
      const { x, y } = event
      const els = [
        ...document.elementsFromPoint(x, y),
        ...document.elementsFromPoint(x + LEFT_OFFSET, y),
      ]
      const outMostElement = els.find(
        (ele) => ele[BLOCK_DOM_PROPERTY] && (ele[BLOCK_DOM_PROPERTY] as Parent).isOutMostBlock
      )
      if (outMostElement) {
        const block = outMostElement[BLOCK_DOM_PROPERTY] as Parent
        // Only show/render if block changed to avoid unnecessary work
        if (this._block !== block) {
          this.show(block)
          this.render()
        }
      } else {
        this.hide()
      }
    }, 300)

    const clickHandler = () => {
      eventCenter.emit('muya-front-menu', {
        reference: {
          getBoundingClientRect: () => container.getBoundingClientRect(),
        },
        block: this._block,
      })
    }

    eventCenter.attachDOMEvent(document, 'mousemove', mousemoveHandler)
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
    if (this._block && this._block === block) return

    this._block = block
    const { domNode } = block
    const { _floatBox: floatBox } = this
    const { placement, offsetOptions } = this._options
    const { eventCenter } = this.muya

    if (this._cleanup) {
      this._cleanup()
      this._cleanup = null
    }

    const styles = window.getComputedStyle(domNode!)
    const paddingTop = Number.parseFloat(styles.paddingTop)

    const isLooseList = isOrderOrBulletList(block) && block.meta.loose
    const dynamicMainAxis = isLooseList ? paddingTop * 2 : paddingTop

    // Extract offset values, handling both number and object types
    let crossAxisValue = 0
    let alignmentAxisValue = 0
    if (typeof offsetOptions === 'object' && offsetOptions !== null && !('then' in offsetOptions)) {
      crossAxisValue = (offsetOptions as { crossAxis?: number }).crossAxis ?? 0
      alignmentAxisValue = (offsetOptions as { alignmentAxis?: number | null }).alignmentAxis ?? 0
    }

    const updatePosition = () => {
      computePosition(domNode! as Element | ReferenceElement, floatBox, {
        placement,
        middleware: [
          offset({
            mainAxis: dynamicMainAxis,
            crossAxis: crossAxisValue,
            alignmentAxis: alignmentAxisValue,
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
