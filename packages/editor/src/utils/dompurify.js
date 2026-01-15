import DOMPurify from 'dompurify'

export const isValidAttribute = DOMPurify.isValidAttribute || ((tag, attr, value) => true)

export default DOMPurify.sanitize.bind(DOMPurify)
