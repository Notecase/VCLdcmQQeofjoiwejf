/**
 * Type declarations for pdf-parse
 */

declare module 'pdf-parse' {
  interface PDFInfo {
    Title?: string
    Author?: string
    Subject?: string
    Keywords?: string
    Creator?: string
    Producer?: string
    CreationDate?: string
    ModDate?: string
  }

  interface PDFMetadata {
    _metadata?: Record<string, unknown>
  }

  interface PDFData {
    numpages: number
    numrender: number
    info: PDFInfo | null
    metadata: PDFMetadata | null
    text: string
    version: string
  }

  interface PDFOptions {
    pagerender?: (pageData: {
      getTextContent: () => Promise<{
        items: Array<{ str: string }>
      }>
    }) => Promise<string>
    max?: number
  }

  function pdfParse(
    dataBuffer: Buffer,
    options?: PDFOptions
  ): Promise<PDFData>

  export = pdfParse
}
