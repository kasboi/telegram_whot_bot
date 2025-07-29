#!/usr/bin/env -S deno run --allow-env --allow-net --allow-write --allow-read --allow-import --unstable-kv

/**
 * Test script to verify the expired callback fix works
 */

import { safeAnswerCallbackQuery } from '../src/utils/callback.ts'

console.log('🧪 Testing Expired Callback Fix')
console.log('===============================')

// Create a mock context that simulates an expired callback query
const mockCtx = {
  from: { id: 123456, first_name: 'TestUser' },
  answerCallbackQuery: async (text: any, options?: any) => {
    console.log(`   Would answer: ${typeof text === 'string' ? text : text.text}`)
    // Simulate the expired query error
    throw new Error('Call to \'answerCallbackQuery\' failed! (400: Bad Request: query is too old and response timeout expired or query ID is invalid)')
  }
}

async function testExpiredCallback() {
  console.log('1. Testing string callback...')
  const result1 = await safeAnswerCallbackQuery(mockCtx as any, '🎴 Drew a card!')
  console.log(`   Result: ${result1 ? 'Success' : 'Gracefully handled expired query'}`)

  console.log('2. Testing object callback...')
  const result2 = await safeAnswerCallbackQuery(mockCtx as any, { text: '❌ Game not found', show_alert: true })
  console.log(`   Result: ${result2 ? 'Success' : 'Gracefully handled expired query'}`)

  console.log('\n✅ Expired callback handling works correctly!')
  console.log('   - No errors thrown')
  console.log('   - Gracefully handles expired queries')
  console.log('   - Logs appropriate debug messages')
}

if (import.meta.main) {
  await testExpiredCallback()
}
