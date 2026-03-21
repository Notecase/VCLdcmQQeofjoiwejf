import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAIModel, getModelForTask, getEmbeddingModel, resetAIProviders } from './ai-sdk-factory'
import { MODEL_REGISTRY } from './model-registry'
import type { ModelEntry } from './model-registry'

// Mock the AI SDK provider constructors
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, _provider: 'openai-mock' })
    provider.embedding = (modelId: string) => ({ modelId, _provider: 'openai-embedding-mock' })
    return provider
  }),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, _provider: 'google-mock' })
    provider.textEmbeddingModel = (modelId: string) => ({
      modelId,
      _provider: 'google-embedding-mock',
    })
    return provider
  }),
}))

describe('ai-sdk-factory', () => {
  beforeEach(() => {
    resetAIProviders()
  })

  it('createAIModel returns a model for gemini provider', () => {
    const entry = MODEL_REGISTRY['gemini-3.1-pro-preview']
    const model = createAIModel(entry) as unknown as { modelId: string }
    expect(model.modelId).toBe('gemini-3.1-pro-preview')
  })

  it('createAIModel returns a model for openai provider', () => {
    const entry = MODEL_REGISTRY['text-embedding-3-large']
    const model = createAIModel(entry) as unknown as { modelId: string }
    expect(model.modelId).toBe('text-embedding-3-large')
  })

  it('createAIModel returns a model for ollama-cloud provider', () => {
    const entry = MODEL_REGISTRY['kimi-k2.5']
    const model = createAIModel(entry) as unknown as { modelId: string }
    expect(model.modelId).toBe('kimi-k2.5')
  })

  it('getModelForTask resolves task type to model', () => {
    const model = getModelForTask('chat') as unknown as { modelId: string }
    expect(model.modelId).toBe('gemini-3.1-pro-preview')
  })

  it('getModelForTask for artifact returns kimi model', () => {
    const model = getModelForTask('artifact') as unknown as { modelId: string }
    expect(model.modelId).toBe('kimi-k2.5')
  })

  it('getEmbeddingModel returns an embedding model', () => {
    const model = getEmbeddingModel() as unknown as { modelId: string; _provider: string }
    expect(model.modelId).toBe('text-embedding-3-large')
    expect(model._provider).toBe('openai-embedding-mock')
  })

  it('throws on unknown provider', () => {
    const fakeEntry = { id: 'fake', provider: 'unknown' } as unknown as ModelEntry
    expect(() => createAIModel(fakeEntry)).toThrow('Unknown provider')
  })

  it('reuses provider singletons across calls', async () => {
    const { createOpenAI } = vi.mocked(await import('@ai-sdk/openai'))
    resetAIProviders()
    createOpenAI.mockClear()

    const entry = MODEL_REGISTRY['text-embedding-3-large']
    createAIModel(entry)
    createAIModel(entry)

    // createOpenAI should only be called once (singleton)
    expect(createOpenAI).toHaveBeenCalledTimes(1)
  })
})
