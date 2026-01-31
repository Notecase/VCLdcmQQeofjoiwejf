import katex from 'katex'

export interface IMathToken {
  type: 'inlineMath' | 'multiplemath'
  raw: string
  text: string
  displayMode: boolean
  mathStyle?: '' | 'gitlab'
}

interface IOptions {
  throwOnError?: boolean
  useKatexRender?: boolean
}

const inlineStartRule = /(\s|^)\${1,2}(?!\$)/
// Single $ inline math - no newlines, no $ inside
const inlineRule = /^(\$)(?!\$)([^$\n]+?)\1(?!\$)/
// Double $$ display math on same line (no newlines required) - allows $ inside but not $$
const displayMathInlineRule = /^\$\$(?!\$)((?:[^$]|\$(?!\$))+?)\$\$(?!\$)/
// Double $$ block math with newlines
const blockRule = /^(\$\$)\n((?:\\[\s\S]|[^\\])+?)\n\1(?:\n|$)/

const DEFAULT_OPTIONS = {
  throwOnError: false,
  useKatexRender: false,
}

export default function (options: IOptions = {}) {
  const opts = Object.assign({}, DEFAULT_OPTIONS, options)

  return {
    extensions: [
      // Display math inline ($$...$$) must come before single $ inline math
      displayMathInline(createRenderer(opts, false)),
      inlineKatex(createRenderer(opts, false)),
      blockKatex(createRenderer(opts, true)),
    ],
  }
}

function createRenderer(options: IOptions, newlineAfter: boolean) {
  return (token: IMathToken) => {
    const { useKatexRender, ...otherOpts } = options
    const { type, text, displayMode, mathStyle } = token
    if (useKatexRender) {
      return (
        katex.renderToString(text, {
          ...otherOpts,
          displayMode,
        }) + (newlineAfter ? '\n' : '')
      )
    } else {
      return type === 'inlineMath'
        ? `$${text}$`
        : `<pre class="multiple-math" data-math-style="${mathStyle}">${text}</pre>\n`
    }
  }
}

// Display math on same line: $$...$$
function displayMathInline(renderer: (token: IMathToken) => string) {
  return {
    name: 'displayMath',
    level: 'inline' as const,
    start(src: string) {
      const index = src.indexOf('$$')
      if (index !== -1) {
        const possibleKatex = src.substring(index)
        if (possibleKatex.match(displayMathInlineRule)) return index
      }
      return -1
    },
    tokenizer(src: string) {
      const match = src.match(displayMathInlineRule)
      if (match) {
        return {
          type: 'inlineMath',
          raw: match[0],
          text: match[1].trim(),
          displayMode: true,
        }
      }
    },
    renderer,
  }
}

// Single $ inline math: $...$
function inlineKatex(renderer: (token: IMathToken) => string) {
  return {
    name: 'inlineMath',
    level: 'inline' as const,
    start(src: string) {
      const match = src.match(inlineStartRule)
      if (!match) return

      const index = (match.index || 0) + match[1].length
      const possibleKatex = src.substring(index)

      if (possibleKatex.match(inlineRule)) return index
    },
    tokenizer(src: string) {
      const match = src.match(inlineRule)
      if (match) {
        return {
          type: 'inlineMath',
          raw: match[0],
          text: match[2].trim(),
          displayMode: false,
        }
      }
    },
    renderer,
  }
}

function blockKatex(renderer: (token: IMathToken) => string) {
  return {
    name: 'multiplemath',
    level: 'block' as const,
    start(src: string) {
      return src.indexOf('\n$')
    },
    tokenizer(src: string) {
      const match = src.match(blockRule)
      if (match) {
        return {
          type: 'multiplemath',
          raw: match[0],
          text: match[2].trim(),
          displayMode: match[1].length === 2,
          mathStyle: '',
        }
      }
    },
    renderer,
  }
}
