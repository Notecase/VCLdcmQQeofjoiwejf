import { describe, expect, it } from 'vitest'
import { buildSrcDoc, buildSrcDocFromText, parseArtifactContent } from './buildSrcDoc'

describe('buildSrcDoc', () => {
  it('injects sandbox-safe compatibility prelude', () => {
    const doc = buildSrcDoc({
      html: '<div id="app"></div>',
      javascript: 'console.log("ready")',
    })

    expect(doc).toContain('const __inkdownCreateMemoryStorage = () => {')
    expect(doc).toContain('const __inkdownSetGlobal = (target, key, value) => {')
    expect(doc).toContain('__inkdownSetGlobal(window, "localStorage", __inkdownLocalStorage);')
    expect(doc).toContain('const __inkdownRenderRuntimeError = (rawError) => {')
    expect(doc).toContain('window.addEventListener("unhandledrejection", (event) => {')
  })

  it('normalizes frequent sandbox-restricted access patterns', () => {
    const doc = buildSrcDoc({
      javascript: `
        window.parent.document.title = "Study Timer";
        const existing = localStorage.getItem("timer_state");
        window["sessionStorage"].setItem("mode", "focus");
        globalThis.localStorage.setItem("theme", "dark");
      `,
    })

    expect(doc).toContain('document.title = "Study Timer";')
    expect(doc).not.toContain('window.parent.document.title')
    expect(doc).toContain('window.__inkdownLocalStorage.getItem("timer_state")')
    expect(doc).toContain('window.__inkdownSessionStorage.setItem("mode", "focus")')
    expect(doc).toContain('window.__inkdownLocalStorage.setItem("theme", "dark")')
  })

  it('keeps existing JSON/raw artifact parsing behavior intact', () => {
    const parsedJson = parseArtifactContent(
      JSON.stringify({
        html: '<main>hello</main>',
        css: 'main { color: red; }',
        javascript: 'console.log("ok")',
      })
    )
    expect(parsedJson).toEqual({
      html: '<main>hello</main>',
      css: 'main { color: red; }',
      javascript: 'console.log("ok")',
    })

    const raw = '<section>raw html artifact</section>'
    expect(parseArtifactContent(raw)).toEqual({
      html: raw,
      css: '',
      javascript: '',
    })

    const srcDoc = buildSrcDocFromText(raw)
    expect(srcDoc).toContain(raw)
  })
})
