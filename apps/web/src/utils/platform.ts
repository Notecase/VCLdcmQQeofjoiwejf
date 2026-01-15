/**
 * Platform abstraction layer for web environment
 * Replaces Electron-specific APIs with web equivalents
 */

// External link handling (replaces shell.openExternal)
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Clipboard operations
export const clipboard = {
  writeText(text: string): Promise<void> {
    return navigator.clipboard.writeText(text)
  },

  readText(): Promise<string> {
    return navigator.clipboard.readText()
  },

  async writeHTML(html: string): Promise<void> {
    const blob = new Blob([html], { type: 'text/html' })
    const item = new ClipboardItem({ 'text/html': blob })
    await navigator.clipboard.write([item])
  }
}

// Path utilities (replaces Node.js path module)
export const path = {
  join(...parts: string[]): string {
    return parts
      .map((part, index) => {
        if (index === 0) {
          return part.replace(/\/$/, '')
        }
        return part.replace(/^\/|\/$/g, '')
      })
      .filter(Boolean)
      .join('/')
  },

  dirname(filepath: string): string {
    const parts = filepath.split('/')
    parts.pop()
    return parts.join('/') || '/'
  },

  basename(filepath: string, ext?: string): string {
    const base = filepath.split('/').pop() || ''
    if (ext && base.endsWith(ext)) {
      return base.slice(0, -ext.length)
    }
    return base
  },

  extname(filepath: string): string {
    const base = filepath.split('/').pop() || ''
    const dotIndex = base.lastIndexOf('.')
    return dotIndex > 0 ? base.slice(dotIndex) : ''
  },

  resolve(...parts: string[]): string {
    return this.join(...parts)
  },

  isAbsolute(filepath: string): boolean {
    return filepath.startsWith('/') || /^https?:\/\//.test(filepath)
  }
}

// Platform detection
export const platform = {
  isMac: /Mac|iPhone|iPad|iPod/.test(navigator.platform),
  isWindows: /Win/.test(navigator.platform),
  isLinux: /Linux/.test(navigator.platform),

  get os(): 'darwin' | 'win32' | 'linux' {
    if (this.isMac) return 'darwin'
    if (this.isWindows) return 'win32'
    return 'linux'
  }
}

// Check if running in web environment
export const isWeb = true
export const isElectron = false

// Image utilities
export async function loadImageAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function fetchImageAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  return response.blob()
}

export function createObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export function revokeObjectURL(url: string): void {
  URL.revokeObjectURL(url)
}

// File dialog (web File API)
export function openFileDialog(accept: string = '.md,.markdown,.txt'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      resolve(input.files?.[0] || null)
    }
    input.click()
  })
}

export function openImageDialog(): Promise<File | null> {
  return openFileDialog('image/*')
}

// Download file
export function downloadFile(content: string | Blob, filename: string, mimeType: string = 'text/plain'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Export markdown file
export function exportMarkdown(content: string, filename: string = 'document.md'): void {
  downloadFile(content, filename, 'text/markdown')
}

// Export HTML file
export function exportHTML(content: string, filename: string = 'document.html'): void {
  downloadFile(content, filename, 'text/html')
}
