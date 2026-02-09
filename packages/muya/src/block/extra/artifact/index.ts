import type { Muya } from '../../../muya'
import type { IArtifactMeta, IArtifactState } from '../../../state/types'
import type { TBlockPath } from '../../types'
import Parent from '../../base/parent'
import { ScrollPage } from '../../scrollPage'

/**
 * ArtifactBlock - Interactive HTML/CSS/JS artifact with sandboxed preview
 *
 * Structure:
 * - ArtifactBlock (figure.mu-artifact-block)
 *   - ArtifactPreview (attachment - sandboxed iframe)
 *   - ArtifactContainer (pre.mu-artifact-container)
 *     - Code (code block for editing JSON content)
 */
class ArtifactBlock extends Parent {
  public meta: IArtifactMeta
  static override blockName = 'artifact'

  static create(muya: Muya, state: IArtifactState) {
    const artifactBlock = new ArtifactBlock(muya, state)

    // Create preview (iframe) as attachment
    const artifactPreview = ScrollPage.loadBlock('artifact-preview').create(muya, state)
    // Create container with code block for editing
    const artifactContainer = ScrollPage.loadBlock('artifact-container').create(muya, state)

    artifactBlock.appendAttachment(artifactPreview)
    artifactBlock.append(artifactContainer)

    return artifactBlock
  }

  override get path() {
    const { path: pPath } = this.parent!
    const offset = this.parent!.offset(this)

    return [...pPath, offset]
  }

  constructor(muya: Muya, { meta }: IArtifactState) {
    super(muya)
    this.tagName = 'figure'
    this.meta = meta
    this.classList = ['mu-artifact-block']
    this.createDomNode()

    // Set stable ID for artifact block DOM node
    // Required for modal open/save event matching
    if (this.domNode) {
      this.domNode.id = `artifact-${crypto.randomUUID()}`
    }
  }

  queryBlock(path: TBlockPath) {
    return path.length && path[0] === 'text' ? this.firstContentInDescendant() : this
  }

  override getState(): IArtifactState {
    const { meta } = this
    const text = this.firstContentInDescendant()?.text

    if (text == null) throw new Error('text is null when getState in artifact block.')

    return {
      name: 'artifact',
      text,
      meta,
    }
  }

  /**
   * Update the artifact preview when code changes
   */
  updatePreview() {
    if (this.attachments?.length) {
      const preview = this.attachments.head as { update?: (code: string) => void }
      if (preview?.update) {
        const text = this.firstContentInDescendant()?.text || '{}'
        preview.update(text)
      }
    }
  }

  /**
   * Update artifact state (title, code, height) and trigger change event
   * Called by ArtifactPreview when user edits code in modal or resizes
   */
  updateState(updates: { title?: string; code?: string; customHeight?: number }): void {
    const basePath = this.path

    // Update meta.title if changed
    if (updates.title !== undefined && updates.title !== this.meta.title) {
      const oldTitle = this.meta.title
      this.meta.title = updates.title
      this.jsonState.replaceOperation([...basePath, 'meta', 'title'], oldTitle, updates.title)
    }

    // Update meta.customHeight if changed
    if (updates.customHeight !== undefined && updates.customHeight !== this.meta.customHeight) {
      const oldHeight = this.meta.customHeight ?? 300 // Default height
      this.meta.customHeight = updates.customHeight
      this.jsonState.replaceOperation(
        [...basePath, 'meta', 'customHeight'],
        oldHeight,
        updates.customHeight
      )
    }

    // Update code block text if changed
    // Note: Setting text triggers jsonState.editOperation() which emits json-change
    if (updates.code !== undefined) {
      const codeBlock = this.firstContentInDescendant()
      if (codeBlock && codeBlock.text !== updates.code) {
        codeBlock.text = updates.code
      }
    }
  }
}

export default ArtifactBlock
