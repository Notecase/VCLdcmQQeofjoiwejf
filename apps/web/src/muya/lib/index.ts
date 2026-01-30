// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Muya Bridge Module
 *
 * Re-exports from @inkdown/muya package for backwards compatibility.
 * This allows apps/web to import from '@/muya/lib' which was the old path.
 *
 * TODO: Migrate imports directly to @inkdown/muya and remove this bridge.
 */

export { Muya as default, Muya } from '@inkdown/muya'
export * from '@inkdown/muya'
