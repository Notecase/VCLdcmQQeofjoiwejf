import type Format from '../../block/base/format'
import type { H, Token } from '../types'
import type Renderer from './index'
import { union } from '../../utils'

// change text to highlight vnode
export default function highlight(
  this: Renderer,
  h: H,
  block: Format,
  rStart: number,
  rEnd: number,
  token: Token
) {
  const { text } = block
  const { highlights } = token
  let result = []
  const unions = []
  let pos = rStart

  if (highlights) {
    for (const light of highlights) {
      const un = union({ start: rStart, end: rEnd }, light)
      if (un) unions.push(un)
    }
  }

  if (unions.length) {
    for (const u of unions) {
      const { start, end } = u
      const className = this.getHighlightClassName(u)

      if (pos < start) result.push(text.substring(pos, start))

      // Add data-hunk-id attribute for diff highlights
      const attrs: Record<string, string> = {}
      if (u.hunkId) {
        attrs['data-hunk-id'] = u.hunkId
      }

      result.push(h(`span.${className}`, { attrs }, text.substring(start, end)))
      pos = end
    }

    if (pos < rEnd) result.push(block.text.substring(pos, rEnd))
  } else {
    result = [text.substring(rStart, rEnd)]
  }

  return result
}
