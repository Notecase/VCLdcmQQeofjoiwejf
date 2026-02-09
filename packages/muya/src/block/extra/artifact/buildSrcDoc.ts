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

function normalizeUnsafeJavaScript(source: string): string {
  if (!source) return ''

  return source
    // Cross-frame document access is blocked in sandboxed iframes without same-origin.
    .replace(/\bwindow\.(?:parent|top)\?\.document\b/g, 'document')
    .replace(/\bwindow\.(?:parent|top)\.document\b/g, 'document')
    .replace(/\b(?:parent|top)\?\.document\b/g, 'document')
    .replace(/\b(?:parent|top)\.document\b/g, 'document')
    // Storage APIs are unavailable in opaque-origin sandboxed iframes.
    .replace(/\bwindow\[['"]localStorage['"]\]/g, 'window.__inkdownLocalStorage')
    .replace(/\bglobalThis\[['"]localStorage['"]\]/g, 'window.__inkdownLocalStorage')
    .replace(/\bwindow\.localStorage\b/g, 'window.__inkdownLocalStorage')
    .replace(/\bglobalThis\.localStorage\b/g, 'window.__inkdownLocalStorage')
    .replace(/\blocalStorage(?=\s*(?:\.|\[|\?\.))/g, 'window.__inkdownLocalStorage')
    .replace(/\bwindow\[['"]sessionStorage['"]\]/g, 'window.__inkdownSessionStorage')
    .replace(/\bglobalThis\[['"]sessionStorage['"]\]/g, 'window.__inkdownSessionStorage')
    .replace(/\bwindow\.sessionStorage\b/g, 'window.__inkdownSessionStorage')
    .replace(/\bglobalThis\.sessionStorage\b/g, 'window.__inkdownSessionStorage')
    .replace(/\bsessionStorage(?=\s*(?:\.|\[|\?\.))/g, 'window.__inkdownSessionStorage')
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
  const normalizedJavascript = normalizeUnsafeJavaScript(javascript)

  const parts: string[] = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <!-- Tailwind CSS CDN -->',
    '  <script src="https://cdn.tailwindcss.com"></script>',
    '  <!-- React and ReactDOM CDN -->',
    '  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>',
    '  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>',
    '  <!-- Babel for JSX transformation -->',
    '  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>',
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
    "      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
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
      '  <script>',
      '    const __inkdownCreateMemoryStorage = () => {',
      '      const state = Object.create(null);',
      '      return {',
      '        get length() {',
      '          return Object.keys(state).length;',
      '        },',
      '        key(index) {',
      '          const keys = Object.keys(state);',
      '          return keys[index] ?? null;',
      '        },',
      '        getItem(key) {',
      '          const normalized = String(key);',
      '          return Object.prototype.hasOwnProperty.call(state, normalized) ? state[normalized] : null;',
      '        },',
      '        setItem(key, value) {',
      '          state[String(key)] = String(value);',
      '        },',
      '        removeItem(key) {',
      '          delete state[String(key)];',
      '        },',
      '        clear() {',
      '          for (const key of Object.keys(state)) delete state[key];',
      '        },',
      '      };',
      '    };',
      '    const __inkdownTryGet = (getter, fallback) => {',
      '      try {',
      '        const value = getter();',
      '        return value ?? fallback;',
      '      } catch {',
      '        return fallback;',
      '      }',
      '    };',
      '    const __inkdownSetGlobal = (target, key, value) => {',
      '      if (!target) return;',
      '      try {',
      '        Object.defineProperty(target, key, {',
      '          configurable: true,',
      '          enumerable: false,',
      '          writable: true,',
      '          value,',
      '        });',
      '      } catch {',
      '        try {',
      '          target[key] = value;',
      '        } catch {',
      '          // Ignore assignment failures in locked-down runtimes.',
      '        }',
      '      }',
      '    };',
      '    const __inkdownLocalStorage = __inkdownTryGet(() => window.localStorage, __inkdownCreateMemoryStorage());',
      '    const __inkdownSessionStorage = __inkdownTryGet(() => window.sessionStorage, __inkdownCreateMemoryStorage());',
      '    __inkdownSetGlobal(window, "__inkdownLocalStorage", __inkdownLocalStorage);',
      '    __inkdownSetGlobal(window, "__inkdownSessionStorage", __inkdownSessionStorage);',
      '    __inkdownSetGlobal(window, "localStorage", __inkdownLocalStorage);',
      '    __inkdownSetGlobal(window, "sessionStorage", __inkdownSessionStorage);',
      '    if (typeof globalThis !== "undefined") {',
      '      __inkdownSetGlobal(globalThis, "__inkdownLocalStorage", __inkdownLocalStorage);',
      '      __inkdownSetGlobal(globalThis, "__inkdownSessionStorage", __inkdownSessionStorage);',
      '      __inkdownSetGlobal(globalThis, "localStorage", __inkdownLocalStorage);',
      '      __inkdownSetGlobal(globalThis, "sessionStorage", __inkdownSessionStorage);',
      '    }',
      '  </script>',
      '  <script type="text/babel">',
      '    const __inkdownRenderRuntimeError = (rawError) => {',
      '      console.error("Artifact JS Error:", rawError);',
      '      const errorMessage = rawError instanceof Error ? rawError.message : String(rawError);',
      '      const lower = errorMessage.toLowerCase();',
      '      const isSandboxSecurityError =',
      "        lower.includes('insecure') ||",
      "        lower.includes('security') ||",
      "        lower.includes('denied') ||",
      "        lower.includes('permission') ||",
      "        lower.includes('blocked a frame') ||",
      "        lower.includes('not allowed');",
      "      const message = isSandboxSecurityError",
      "        ? 'Sandbox Security Error: ' + errorMessage + '\\nHint: avoid window.parent/window.top and browser storage APIs in artifacts.'",
      "        : 'JavaScript Error: ' + errorMessage;",
      '      const existing = document.getElementById("__inkdown-artifact-error");',
      '      if (existing) {',
      '        existing.textContent = message;',
      '        return;',
      '      }',
      "      const errorDiv = document.createElement('div');",
      '      errorDiv.id = "__inkdown-artifact-error";',
      "      errorDiv.style.cssText = 'padding: 16px; background: #fee; color: #c00; border-radius: 8px; font-family: monospace; white-space: pre-wrap;';",
      '      errorDiv.textContent = message;',
      '      document.body.appendChild(errorDiv);',
      '    };',
      '    window.addEventListener("error", (event) => {',
      '      __inkdownRenderRuntimeError(event.error || event.message || "Unknown script error");',
      '    });',
      '    window.addEventListener("unhandledrejection", (event) => {',
      '      __inkdownRenderRuntimeError(event.reason || "Unhandled promise rejection");',
      '    });',
      '    try {',
      normalizedJavascript,
      '    } catch (error) {',
      '      __inkdownRenderRuntimeError(error);',
      '    }',
      '  </script>'
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
