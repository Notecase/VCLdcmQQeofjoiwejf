/**
 * Stub for @marktext/file-icons
 * The file icon library is not needed for the web version
 */

interface FileIcons {
  matchName: (name: string) => null
  matchLanguage: (lang: string) => null
  getClassByName: (name: string) => null
  getClassByLanguage: (lang: string) => null
}

const fileIcons: FileIcons = {
  matchName: () => null,
  matchLanguage: () => null,
  getClassByName: () => null,
  getClassByLanguage: () => null,
}

export default fileIcons
