import { describe, it, expect } from 'vitest'

const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateUserCode(bytes: Buffer): string {
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_CHARS[bytes[i] % USER_CODE_CHARS.length]
    if (i === 3) code += '-'
  }
  return code
}

describe('generateUserCode', () => {
  it('produces XXXX-XXXX format', () => {
    const bytes = Buffer.alloc(8, 0)
    const code = generateUserCode(bytes)
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('uses only allowed chars (no 0, 1, I, O)', () => {
    for (let seed = 0; seed < 256; seed++) {
      const bytes = Buffer.alloc(8, seed)
      const code = generateUserCode(bytes).replace('-', '')
      for (const char of code) {
        expect(USER_CODE_CHARS).toContain(char)
      }
    }
  })

  it('always produces exactly 9 chars (8 + hyphen)', () => {
    const bytes = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80])
    expect(generateUserCode(bytes)).toHaveLength(9)
  })
})
