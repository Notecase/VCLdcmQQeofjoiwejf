import { toolNames, allTools, getToolByName, TOOL_METADATA } from './tools'
console.log('Total tools:', allTools.length)
// Expected: 31 (26 + 5 from original)
console.log('\nTools by category:')
console.log('Core:', toolNames.core.length)       // 8
console.log('Database:', toolNames.database.length) // 10
console.log('Artifact:', toolNames.artifact.length) // 6
console.log('Secretary:', toolNames.secretary.length) // 7
// Test tool lookup
const readNote = getToolByName('read_note')
console.log('\nread_note tool:', readNote?.description)
// Test metadata
console.log('\nTool metadata for create_roadmap:', TOOL_METADATA['create_roadmap'])
console.log('\n✅ Tool registry working')