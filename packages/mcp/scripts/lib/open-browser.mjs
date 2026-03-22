import { spawnSync } from 'node:child_process'

export function openBrowser(url) {
  let command, args

  if (process.platform === 'darwin') {
    command = 'open'
    args = [url]
  } else if (process.platform === 'win32') {
    command = 'cmd'
    args = ['/c', 'start', '', url]
  } else {
    command = 'xdg-open'
    args = [url]
  }

  const result = spawnSync(command, args, { stdio: 'ignore' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Failed to open browser (exit code ${result.status})`)
}
