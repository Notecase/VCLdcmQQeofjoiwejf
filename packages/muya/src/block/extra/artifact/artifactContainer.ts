import type { Muya } from '../../../muya'
import type { IArtifactMeta, IArtifactState, TState } from '../../../state/types'
import logger from '../../../utils/logger'
import Parent from '../../base/parent'
import { ScrollPage } from '../../scrollPage'

const debug = logger('artifactContainer:')

/**
 * ArtifactContainer - Contains the code block for editing artifact JSON content
 */
class ArtifactContainer extends Parent {
  public meta: IArtifactMeta
  static override blockName = 'artifact-container'

  static create(muya: Muya, state: IArtifactState) {
    const artifactContainer = new ArtifactContainer(muya, state)

    // Create a code block child for editing the JSON content
    const code = ScrollPage.loadBlock('code').create(muya, state)
    artifactContainer.append(code)

    return artifactContainer
  }

  get title() {
    return this.meta.title
  }

  override get path() {
    const { path: pPath } = this.parent!
    return [...pPath]
  }

  constructor(muya: Muya, { meta }: IArtifactState) {
    super(muya)
    this.tagName = 'pre'
    this.meta = meta
    this.classList = ['mu-artifact-container']
    this.createDomNode()
  }

  override getState(): TState {
    debug.warn('You can never call `getState` in artifactContainer')
    return {} as TState
  }
}

export default ArtifactContainer
