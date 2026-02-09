import { describe, it, expect } from 'vitest'
import { classifyResearchRequest, shouldEnableResearchFiles } from './routing'

describe('classifyResearchRequest', () => {
  it('routes explicit note creation requests to note mode', () => {
    expect(classifyResearchRequest('create a note about monkey')).toBe('note')
    expect(classifyResearchRequest('write a note about the history of jazz')).toBe('note')
  })

  it('routes plain roadmap-style prompts to chat mode', () => {
    expect(
      classifyResearchRequest('make me a 4 month roadmap for learning backend engineering')
    ).toBe('chat')
    expect(classifyResearchRequest('create a 12-week study plan for machine learning')).toBe('chat')
  })

  it('routes detailed long-form roadmap prompts to markdown mode', () => {
    expect(classifyResearchRequest('create a detailed 3-month roadmap to learn RL')).toBe(
      'markdown'
    )
    expect(classifyResearchRequest('full roadmap for learning Rust in 8 weeks')).toBe('markdown')
  })

  it('routes deep research requests to research mode', () => {
    expect(classifyResearchRequest('do deep research on battery recycling and cite sources')).toBe(
      'research'
    )
    expect(classifyResearchRequest('research and compare VAE vs DAG with web sources')).toBe(
      'research'
    )
  })

  it('defaults normal explain/chat requests to chat mode', () => {
    expect(classifyResearchRequest('explain VAE in simple terms')).toBe('chat')
    expect(classifyResearchRequest('what is the difference between stack and queue?')).toBe('chat')
  })

  it('honors explicit output preference overrides for mode selection', () => {
    expect(classifyResearchRequest('create a note about monkey', 'md_file')).toBe('markdown')
    expect(classifyResearchRequest('explain VAE in simple terms', 'note')).toBe('note')
    expect(classifyResearchRequest('make a 4 month roadmap', 'chat')).toBe('chat')
  })

  it('enables research file writes only for explicit file requests in research mode', () => {
    expect(shouldEnableResearchFiles('research climate policy trends with citations')).toBe(false)
    expect(
      shouldEnableResearchFiles('do deep research on climate policy and save a markdown report')
    ).toBe(true)
    expect(shouldEnableResearchFiles('make a 4 month roadmap to learn deep learning')).toBe(false)
    expect(
      shouldEnableResearchFiles('create a detailed 3 months roadmap to learn deep learning')
    ).toBe(false)
  })

  it('disables research files when chat-only is explicitly requested', () => {
    expect(
      shouldEnableResearchFiles(
        'do deep research and save a markdown report, but respond in chat only'
      )
    ).toBe(false)
  })

  it('honors explicit output preference overrides for file behavior', () => {
    expect(shouldEnableResearchFiles('explain VAE', 'md_file')).toBe(true)
    expect(shouldEnableResearchFiles('make a roadmap', 'chat')).toBe(false)
    expect(shouldEnableResearchFiles('create a note about monkey', 'note')).toBe(false)
  })
})
