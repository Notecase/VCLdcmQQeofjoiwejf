import { isValidAttribute } from '../utils/dompurify'

export const sanitizeHyperlink = (rawLink) => {
  if (rawLink && typeof rawLink === 'string') {
    if (isValidAttribute('a', 'href', rawLink)) {
      return rawLink
    }
  }
  return ''
}
