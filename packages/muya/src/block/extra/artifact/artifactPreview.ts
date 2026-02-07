import type { Muya } from '../../../muya'
import type { IArtifactState, TState } from '../../../state/types'
import { fromEvent } from 'rxjs'
import logger from '../../../utils/logger'
import Parent from '../../base/parent'
import { buildSrcDocFromText } from './buildSrcDoc'

const debug = logger('artifactPreview:')

interface ArtifactUpdateData {
  blockId: string
  code: string
  title: string
  height: number
}

/**
 * ArtifactPreview - Renders artifact content in a sandboxed iframe
 *
 * Security: Uses sandbox="allow-scripts" WITHOUT allow-same-origin
 * to prevent access to parent DOM/storage.
 */
class ArtifactPreview extends Parent {
  public code: string
  public title: string
  public customHeight: number
  private iframe: HTMLIFrameElement | null = null

  static override blockName = 'artifact-preview'

  static create(muya: Muya, state: IArtifactState) {
    const artifactPreview = new ArtifactPreview(muya, state)
    return artifactPreview
  }

  override get path() {
    debug.warn('You can never call `get path` in artifactPreview')
    return []
  }

  constructor(muya: Muya, { text, meta }: IArtifactState) {
    super(muya)
    this.tagName = 'div'
    this.code = text
    this.title = meta.title || 'Artifact'
    this.customHeight = meta.customHeight || 300
    this.classList = ['mu-artifact-preview']
    this.attributes = {
      spellcheck: 'false',
      contenteditable: 'false',
    }
    this.createDomNode()
    this.render()
    this.attachDOMEvents()
  }

  override getState(): TState {
    debug.warn('You can never call `getState` in artifactPreview')
    return {} as TState
  }

  attachDOMEvents() {
    // Code button click handler
    const codeBtn = this.domNode?.querySelector('.mu-artifact-code-btn')
    if (codeBtn) {
      fromEvent(codeBtn, 'click').subscribe((event: Event) => {
        event.preventDefault()
        event.stopPropagation()
        this.openCodeEditor()
      })
    }

    // Resize handles
    const handles = this.domNode?.querySelectorAll('.mu-artifact-resize-handle')
    handles?.forEach((handle) => {
      fromEvent(handle, 'mousedown').subscribe((e: Event) => {
        this.startResize(e as MouseEvent)
      })
    })

    // Listen for code updates from modal
    this.muya.eventCenter.on('artifact-update-code', this.handleUpdateCode.bind(this))
  }

  private openCodeEditor() {
    // Use parent's stable DOM id (set in ArtifactBlock constructor)
    // Fallback should never trigger since ArtifactBlock always sets id
    const blockId = this.parent?.domNode?.id || crypto.randomUUID()
    this.muya.eventCenter.emit('artifact-open-code-editor', {
      blockId,
      code: this.code,
      title: this.title,
      height: this.customHeight,
    })
  }

  private handleUpdateCode(data: ArtifactUpdateData) {
    // Only update if this is the target block
    if (data.blockId !== this.parent?.domNode?.id) return

    this.code = data.code
    this.title = data.title
    this.customHeight = data.height
    this.update(data.code)
    this.updateHeight(data.height)

    // Persist to artifact block state for auto-save
    const artifactBlock = this.parent
    if (artifactBlock && 'updateState' in artifactBlock) {
      (artifactBlock as any).updateState({
        title: data.title,
        code: data.code,
        customHeight: data.height,
      })
    }
  }

  private startResize(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    const startHeight = this.customHeight
    const startY = event.clientY
    let rafId: number | null = null

    const onMouseMove = (e: MouseEvent) => {
      if (rafId) return // Throttle with RAF

      rafId = requestAnimationFrame(() => {
        const deltaY = e.clientY - startY
        const newHeight = Math.max(100, startHeight + deltaY)
        this.updateHeight(newHeight)
        rafId = null
      })
    }

    const onMouseUp = () => {
      if (rafId) cancelAnimationFrame(rafId)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      // Persist height to artifact block state for auto-save
      const artifactBlock = this.parent
      if (artifactBlock && 'updateState' in artifactBlock) {
        (artifactBlock as any).updateState({ customHeight: this.customHeight })
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  clickHandler(event: Event) {
    const target = event.target as HTMLElement

    // Allow clicks on control elements
    if (target.closest('.mu-artifact-control-pill') || target.closest('.mu-artifact-resize-handle')) {
      return
    }

    // Allow clicks that reach the iframe (let them pass through)
    if (target.closest('.mu-artifact-iframe') || target.closest('.mu-artifact-iframe-container')) {
      return // Don't prevent - let iframe handle its own events
    }

    // Only intercept clicks on the wrapper itself
    event.preventDefault()
    event.stopPropagation()

    if (this.parent == null) return

    // Focus the code editor when clicking the preview
    const cursorBlock = this.parent.firstContentInDescendant()
    cursorBlock?.setCursor(0, 0)
  }

  /**
   * Render the artifact in a sandboxed iframe
   */
  render() {
    if (!this.domNode) return

    // Clear existing content using safe DOM methods
    while (this.domNode.firstChild) {
      this.domNode.removeChild(this.domNode.firstChild)
    }

    // Create iframe container
    const iframeContainer = document.createElement('div')
    iframeContainer.className = 'mu-artifact-iframe-container'
    iframeContainer.style.height = `${this.customHeight}px`

    // Create sandboxed iframe
    this.iframe = document.createElement('iframe')
    this.iframe.className = 'mu-artifact-iframe'
    this.iframe.setAttribute('sandbox', 'allow-scripts') // NO allow-same-origin for security
    this.iframe.setAttribute('title', this.title)

    // Set srcDoc with the artifact content
    if (this.code) {
      try {
        this.iframe.srcdoc = buildSrcDocFromText(this.code)
      } catch (error) {
        this.iframe.srcdoc = this.buildErrorDoc(
          error instanceof Error ? error.message : 'Failed to parse artifact content'
        )
      }
    } else {
      this.iframe.srcdoc = this.buildEmptyDoc()
    }

    iframeContainer.appendChild(this.iframe)
    this.domNode.appendChild(iframeContainer)

    // Create glassmorphic control pill
    const controlPill = document.createElement('div')
    controlPill.className = 'mu-artifact-control-pill'

    // Code button
    const codeBtn = document.createElement('button')
    codeBtn.className = 'mu-artifact-code-btn'
    codeBtn.setAttribute('type', 'button')

    // Code icon SVG
    const codeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    codeSvg.setAttribute('width', '14')
    codeSvg.setAttribute('height', '14')
    codeSvg.setAttribute('viewBox', '0 0 24 24')
    codeSvg.setAttribute('fill', 'none')
    codeSvg.setAttribute('stroke', 'currentColor')
    codeSvg.setAttribute('stroke-width', '2')

    const polyline1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    polyline1.setAttribute('points', '16,18 22,12 16,6')
    const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    polyline2.setAttribute('points', '8,6 2,12 8,18')

    codeSvg.appendChild(polyline1)
    codeSvg.appendChild(polyline2)
    codeBtn.appendChild(codeSvg)

    const btnText = document.createElement('span')
    btnText.textContent = 'Code'
    codeBtn.appendChild(btnText)

    // Divider
    const divider = document.createElement('span')
    divider.className = 'mu-artifact-divider'

    // Expand button
    const expandBtn = document.createElement('button')
    expandBtn.className = 'mu-artifact-expand-btn'
    expandBtn.setAttribute('type', 'button')
    expandBtn.setAttribute('title', 'Expand')

    // Expand icon SVG (arrows pointing outward)
    const expandSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    expandSvg.setAttribute('width', '16')
    expandSvg.setAttribute('height', '16')
    expandSvg.setAttribute('viewBox', '0 0 24 24')
    expandSvg.setAttribute('fill', 'none')
    expandSvg.setAttribute('stroke', 'currentColor')
    expandSvg.setAttribute('stroke-width', '2')
    expandSvg.setAttribute('stroke-linecap', 'round')
    expandSvg.setAttribute('stroke-linejoin', 'round')

    // Top-right arrow
    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path1.setAttribute('d', 'M15 3h6v6')
    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path2.setAttribute('d', 'M14 10l7-7')
    // Bottom-left arrow
    const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path3.setAttribute('d', 'M9 21H3v-6')
    const path4 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path4.setAttribute('d', 'M10 14l-7 7')

    expandSvg.appendChild(path1)
    expandSvg.appendChild(path2)
    expandSvg.appendChild(path3)
    expandSvg.appendChild(path4)
    expandBtn.appendChild(expandSvg)

    controlPill.appendChild(codeBtn)
    controlPill.appendChild(divider)
    controlPill.appendChild(expandBtn)
    this.domNode.appendChild(controlPill)

    // Create corner bracket decorations
    const cornerPositions = ['nw', 'ne', 'sw', 'se'] as const
    cornerPositions.forEach((pos) => {
      const corner = document.createElement('div')
      corner.className = `mu-artifact-corner mu-artifact-corner-${pos}`
      this.domNode!.appendChild(corner)
    })

    // Create corner resize handles (height-only, all corners trigger same behavior)
    cornerPositions.forEach((pos) => {
      const handle = document.createElement('div')
      handle.className = `mu-artifact-resize-handle mu-artifact-resize-${pos}`
      handle.dataset.position = pos
      this.domNode!.appendChild(handle)
    })
  }

  /**
   * Update the artifact content
   */
  update(code = this.code) {
    if (this.code !== code) {
      this.code = code
    }

    if (!this.iframe) {
      this.render()
      return
    }

    if (code) {
      try {
        this.iframe.srcdoc = buildSrcDocFromText(code)
      } catch (error) {
        this.iframe.srcdoc = this.buildErrorDoc(
          error instanceof Error ? error.message : 'Failed to parse artifact content'
        )
      }
    } else {
      this.iframe.srcdoc = this.buildEmptyDoc()
    }
  }

  /**
   * Update the title
   */
  updateTitle(title: string) {
    this.title = title
    const titleEl = this.domNode?.querySelector('.mu-artifact-title')
    if (titleEl) {
      titleEl.textContent = title
    }
    if (this.iframe) {
      this.iframe.setAttribute('title', title)
    }
  }

  /**
   * Update the height
   */
  updateHeight(height: number) {
    this.customHeight = height
    const container = this.domNode?.querySelector('.mu-artifact-iframe-container') as HTMLElement
    if (container) {
      container.style.height = `${height}px`
    }
  }

  private buildEmptyDoc(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      color: #888;
      background: #f8f9fa;
    }
  </style>
</head>
<body>
  <div>&lt; Empty Artifact &gt;</div>
</body>
</html>`
  }

  private buildErrorDoc(message: string): string {
    // Escape message to prevent XSS in error display
    const escapedMessage = this.escapeHtml(message)
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      color: #c00;
      background: #fff5f5;
    }
    .error-title {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .error-message {
      font-family: monospace;
      white-space: pre-wrap;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="error-title">Artifact Error</div>
  <div class="error-message">${escapedMessage}</div>
</body>
</html>`
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

export default ArtifactPreview
