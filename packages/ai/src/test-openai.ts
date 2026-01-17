import { createOpenAIProvider } from './providers/openai'
async function testOpenAI() {
  const provider = createOpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-mini' // Use cheaper model for testing
  })
  
  console.log('Testing OpenAI streaming...')
  
  const stream = provider.chat([
    { role: 'user', content: 'Say "Hello, Inkdown!" and nothing else.' }
  ])
  
  let response = ''
  for await (const chunk of stream) {
    response += chunk
    process.stdout.write(chunk)
  }
  
  console.log('\n\n✅ OpenAI provider working')
  console.log('Usage:', provider.getUsage())
}
testOpenAI()