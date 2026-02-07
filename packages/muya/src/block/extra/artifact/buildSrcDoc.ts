/**
 * Builds a complete HTML document string for sandboxed iframe rendering.
 *
 * Includes CDN imports for Tailwind CSS, React, and ReactDOM.
 * User code is wrapped in error handling for safety.
 */

export interface ArtifactContent {
  html?: string
  css?: string
  javascript?: string
}

/**
 * Parse artifact JSON text into structured content
 */
export function parseArtifactContent(text: string): ArtifactContent {
  if (!text || text.trim() === '') {
    return { html: '', css: '', javascript: '' }
  }

  try {
    const parsed = JSON.parse(text)
    return {
      html: parsed.html || '',
      css: parsed.css || '',
      javascript: parsed.javascript || '',
    }
  } catch {
    // If not valid JSON, treat as raw HTML
    return { html: text, css: '', javascript: '' }
  }
}

/**
 * Build a complete HTML document for iframe srcDoc.
 *
 * IMPORTANT: Uses array.join() instead of template literals to avoid
 * corruption when AI-generated JavaScript contains backticks.
 */
export function buildSrcDoc(content: ArtifactContent): string {
  const { html = '', css = '', javascript = '' } = content

  const parts: string[] = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <!-- Tailwind CSS CDN -->',
    '  <script src="https://cdn.tailwindcss.com"><\/script>',
    '  <!-- React and ReactDOM CDN -->',
    '  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>',
    '  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>',
    '  <!-- Babel for JSX transformation -->',
    '  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>',
    '  <style>',
    '    /* Base reset */',
    '    *, *::before, *::after {',
    '      box-sizing: border-box;',
    '    }',
    '    html {',
    '      height: 100%;',
    '    }',
    '    body {',
    '      margin: 0;',
    '      padding: 0;',
    '      font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;',
    '      line-height: 1.5;',
    '      color: #1a1a1a;',
    '      background: transparent;',
    '      min-height: 100%;',
    '    }',
    '    #root {',
    '      min-height: 100%;',
    '    }',
    '    /* User CSS */',
    css,
    '  </style>',
    '</head>',
    '<body>',
    '  <div id="root">',
    html,
    '  </div>',
  ]

  if (javascript) {
    parts.push(
      '  <script type="text/babel">',
      '    try {',
      javascript,
      '    } catch (error) {',
      '      console.error(\'Artifact JS Error:\', error);',
      '      const errorDiv = document.createElement(\'div\');',
      '      errorDiv.style.cssText = \'padding: 16px; background: #fee; color: #c00; border-radius: 8px; font-family: monospace; white-space: pre-wrap;\';',
      '      errorDiv.textContent = \'JavaScript Error: \' + error.message;',
      '      document.body.appendChild(errorDiv);',
      '    }',
      '  <\/script>',
    )
  }

  parts.push('</body>', '</html>')

  return parts.join('\n')
}

/**
 * Build srcDoc from raw JSON text
 */
export function buildSrcDocFromText(text: string): string {
  const content = parseArtifactContent(text)
  return buildSrcDoc(content)
}
