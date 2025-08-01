#!/usr/bin/env -S deno run --allow-all --unstable-kv
/**
 * Debug script to test stale game cleanup
 */

import { cleanupStaleGames } from './src/utils/downtime-cleanup.ts'
import { getMemoryStore } from './src/game/state.ts'

console.log('🔍 Starting cleanup debug...')

// Show current games in memory
const memoryStore = getMemoryStore()
console.log(`📊 Current games in memory: ${memoryStore.size}`)

for (const [gameId, game] of memoryStore.entries()) {
  const age = Date.now() - game.createdAt.getTime()
  const ageHours = Math.round(age / (60 * 60 * 1000))
  const lastActivity = game.lastActionTime || game.createdAt
  const timeSinceActivity = Date.now() - lastActivity.getTime()
  const hoursInactive = Math.round(timeSinceActivity / (60 * 60 * 1000))

  console.log(`Game ${gameId}:`)
  console.log(`  State: ${game.state}`)
  console.log(`  Age: ${ageHours} hours`)
  console.log(`  Last activity: ${hoursInactive} hours ago`)
  console.log(`  Players: ${game.players.length}`)
  console.log(`  Created: ${game.createdAt.toISOString()}`)
  console.log(`  LastActionTime: ${game.lastActionTime?.toISOString() || 'not set'}`)
  console.log('')
}

// Run cleanup
console.log('🧹 Running cleanup...')
const result = await cleanupStaleGames()
console.log(`✅ Cleanup result: ${result.cleaned} games cleaned`)
console.log('Details:', result.details)

console.log(`📊 Games remaining: ${memoryStore.size}`)
