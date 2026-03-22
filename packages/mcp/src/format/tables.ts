/**
 * Markdown Table Formatter
 */

/**
 * Render a markdown table from headers and rows.
 */
export function markdownTable(headers: string[], rows: string[][]): string {
  const divider = headers.map(() => '---')
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ]
  return lines.join('\n')
}
