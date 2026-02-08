import { describe, expect, it, vi } from 'vitest'

function getPluginNames(plugins: Array<{ plugin: { pluginName?: string; name?: string } }>) {
  return plugins.map(({ plugin }) => plugin.pluginName ?? plugin.name ?? 'unknown')
}

describe('registerMuyaPlugins', () => {
  it('registers base plugins once without front controls', async () => {
    vi.resetModules()

    const { Muya } = await import('@inkdown/muya')
    Muya.plugins = []

    const { registerMuyaPlugins } = await import('./muyaPlugins')

    registerMuyaPlugins()
    const firstPassNames = getPluginNames(Muya.plugins)

    registerMuyaPlugins()
    const secondPassNames = getPluginNames(Muya.plugins)

    expect(secondPassNames).toEqual(firstPassNames)
    expect(firstPassNames).toContain('quickInsert')
    expect(firstPassNames).not.toContain('frontMenu')
    expect(firstPassNames).not.toContain('ParagraphFrontButton')
  })

  it('registers front controls once when enabled later', async () => {
    vi.resetModules()

    const { Muya } = await import('@inkdown/muya')
    Muya.plugins = []

    const { registerMuyaPlugins } = await import('./muyaPlugins')

    registerMuyaPlugins({ frontControls: false })
    registerMuyaPlugins({ frontControls: true })
    registerMuyaPlugins({ frontControls: true })

    const names = getPluginNames(Muya.plugins)

    expect(names.filter((name) => name === 'quickInsert')).toHaveLength(1)
    expect(names.filter((name) => name === 'frontMenu')).toHaveLength(1)
    expect(names.filter((name) => name === 'ParagraphFrontButton')).toHaveLength(1)
  })
})
