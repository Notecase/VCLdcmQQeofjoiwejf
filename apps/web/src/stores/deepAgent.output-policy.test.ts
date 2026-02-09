import { describe, expect, it } from 'vitest'
import { getAutoOutputDestinationForMessage } from './deepAgent.output-policy'

describe('deepAgent output policy', () => {
  it('keeps plain roadmap prompts in chat', () => {
    expect(
      getAutoOutputDestinationForMessage(
        'create a 2 months roadmap to learn Reinforcement learning in AI'
      )
    ).toBeUndefined()
  })

  it('auto-routes detailed long-form roadmap prompts to markdown file', () => {
    expect(
      getAutoOutputDestinationForMessage('create a detailed 3 months roadmap to learn RL')
    ).toBe('md_file')
  })

  it('respects explicit chat-only override', () => {
    expect(
      getAutoOutputDestinationForMessage(
        'create a detailed 3 months roadmap to learn RL in chat only'
      )
    ).toBeUndefined()
  })

  it('auto-routes explicit markdown/file phrasing to markdown file', () => {
    expect(
      getAutoOutputDestinationForMessage('create a roadmap and save it as a markdown file')
    ).toBe('md_file')
  })
})
