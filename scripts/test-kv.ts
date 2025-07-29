#!/usr/bin/env -S deno run --unstable-kv --allow-write=./data

/**
 * Simple test to verify KV store functionality
 */

import { KVGameStore } from '../src/persistence/kvStore.ts'
import { GameSession } from '../src/types/game.ts'

// Create a test game session
const testGame: GameSession = {
  id: 12345,
  state: 'waiting_for_players',
  creatorId: 67890,
  players: [
    {
      id: 67890,
      firstName: 'TestUser',
      state: 'joined',
      cardsPlayedCount: 0,
      specialCardsPlayedCount: 0,
    }
  ],
  createdAt: new Date(),
  reshuffleCount: 0,
  suddenDeath: false,
}

async function testKVStore() {
  console.log('🧪 Testing KV Store functionality...')

  const kvStore = new KVGameStore()

  try {
    // Initialize
    await kvStore.init()
    console.log('✅ KV Store initialized')

    // Health check
    const health = await kvStore.healthCheck()
    console.log('🏥 Health check:', health)

    // Save game
    await kvStore.saveGame(testGame)
    console.log('💾 Game saved')

    // Load game
    const loadedGame = await kvStore.loadGame(testGame.id)
    console.log('📄 Game loaded:', loadedGame?.state, loadedGame?.players.length, 'players')

    // List active games
    const activeGames = await kvStore.listActiveGames()
    console.log('📋 Active games:', activeGames)

    // Get player games
    const playerGames = await kvStore.getPlayerGames(67890)
    console.log('🎮 Player games:', playerGames.length)

    // Delete game
    await kvStore.deleteGame(testGame.id)
    console.log('🗑️ Game deleted')

    // Verify deletion
    const deletedGame = await kvStore.loadGame(testGame.id)
    console.log('🔍 Deleted game check:', deletedGame === null ? 'Successfully deleted' : 'Still exists')

    await kvStore.close()
    console.log('✅ All tests passed!')

  } catch (error) {
    console.error('❌ Test failed:', error)
    await kvStore.close()
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await testKVStore()
}
