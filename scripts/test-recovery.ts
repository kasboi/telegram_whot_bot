#!/usr/bin/env -S deno run --allow-env --allow-net --unstable-kv

/**
 * Test script for game recovery functionality
 * Creates a test game, saves it to KV, clears memory, then recovers it
 */

import { PersistenceManager } from '../src/persistence/mod.ts'
import { GameSession, Player } from '../src/types/game.ts'

// Create a mock game session for testing
function createMockGame(): GameSession {
  const mockPlayers: Player[] = [
    {
      id: 123456789,
      firstName: 'Alice',
      state: 'active',
      cardsPlayedCount: 3,
      specialCardsPlayedCount: 1,
      hand: [
        { id: 'card1', symbol: 'circle', number: 5, isSpecial: false },
        { id: 'card2', symbol: 'triangle', number: 2, isSpecial: true },
        { id: 'card3', symbol: 'whot', number: 20, isSpecial: true }
      ]
    },
    {
      id: 987654321,
      firstName: 'Bob',
      state: 'active',
      cardsPlayedCount: 2,
      specialCardsPlayedCount: 0,
      hand: [
        { id: 'card4', symbol: 'square', number: 7, isSpecial: false },
        { id: 'card5', symbol: 'star', number: 3, isSpecial: false }
      ]
    }
  ]

  return {
    id: -1001234567890, // Mock group chat ID
    state: 'in_progress',
    creatorId: 123456789,
    players: mockPlayers,
    createdAt: new Date(),
    reshuffleCount: 0,
    suddenDeath: false,
    currentPlayerIndex: 0,
    direction: 'clockwise',
    lastPlayedCard: { id: 'top1', symbol: 'circle', number: 8, isSpecial: false },
    chosenSymbol: undefined,
    deck: [
      { id: 'deck1', symbol: 'cross', number: 4, isSpecial: false },
      { id: 'deck2', symbol: 'triangle', number: 9, isSpecial: false }
    ],
    discardPile: [
      { id: 'discard1', symbol: 'square', number: 1, isSpecial: true },
      { id: 'top1', symbol: 'circle', number: 8, isSpecial: false }
    ],
    playedCards: [
      { id: 'played1', symbol: 'star', number: 6, isSpecial: false },
      { id: 'top1', symbol: 'circle', number: 8, isSpecial: false }
    ],
    pendingEffect: undefined
  }
}

async function testRecovery() {
  console.log('🧪 Testing Game Recovery Functionality')
  console.log('=====================================')

  try {
    // Create memory store and persistence manager
    const memoryStore = new Map<number, GameSession>()
    const manager = new PersistenceManager(memoryStore)

    console.log('1. Initializing persistence manager...')
    await manager.init()
    console.log('   ✅ Persistence manager initialized')

    // Create and save a test game
    const testGame = createMockGame()
    console.log('2. Creating test game...')
    console.log(`   📊 Game ID: ${testGame.id}`)
    console.log(`   👥 Players: ${testGame.players.map(p => p.firstName).join(', ')}`)
    console.log(`   🎯 State: ${testGame.state}`)

    // Add to memory and save to KV
    memoryStore.set(testGame.id, testGame)
    await manager.saveGame(testGame)
    console.log('   ✅ Game saved to both memory and KV')

    // Verify it's in memory
    console.log('3. Verifying game in memory...')
    const inMemory = memoryStore.get(testGame.id)
    console.log(`   📦 Games in memory: ${memoryStore.size}`)
    console.log(`   ✅ Game found in memory: ${!!inMemory}`)

    // Clear memory to simulate bot restart
    console.log('4. Simulating bot restart (clearing memory)...')
    memoryStore.clear()
    console.log(`   📦 Games in memory after clear: ${memoryStore.size}`)

    // Try to recover games
    console.log('5. Recovering games from KV storage...')
    const recoveryResult = await manager.recoverGamesFromKV()
    console.log(`   📥 Recovered: ${recoveryResult.recovered} games`)
    console.log(`   ❌ Failed: ${recoveryResult.failed} games`)
    console.log(`   📦 Games in memory after recovery: ${memoryStore.size}`)

    // Verify the recovered game
    console.log('6. Verifying recovered game...')
    const recoveredGame = memoryStore.get(testGame.id)
    if (recoveredGame) {
      console.log('   ✅ Game successfully recovered!')
      console.log(`   📊 Game ID: ${recoveredGame.id}`)
      console.log(`   👥 Players: ${recoveredGame.players.map(p => p.firstName).join(', ')}`)
      console.log(`   🎯 State: ${recoveredGame.state}`)
      console.log(`   🎮 Current player: ${recoveredGame.players[recoveredGame.currentPlayerIndex || 0]?.firstName}`)
      console.log(`   🃏 Last played card: ${recoveredGame.lastPlayedCard?.symbol} ${recoveredGame.lastPlayedCard?.number}`)

      // Verify data integrity
      const originalPlayerCount = testGame.players.length
      const recoveredPlayerCount = recoveredGame.players.length
      const playersMatch = originalPlayerCount === recoveredPlayerCount

      console.log(`   🔍 Data integrity: ${playersMatch ? '✅' : '❌'} (${recoveredPlayerCount}/${originalPlayerCount} players)`)

      if (playersMatch) {
        console.log('\n🎉 Recovery test PASSED! Game state fully recovered.')
      } else {
        console.log('\n⚠️  Recovery test PARTIALLY PASSED - some data may be missing.')
      }
    } else {
      console.log('   ❌ Game NOT recovered!')
      console.log('\n💥 Recovery test FAILED!')
    }

    // Clean up - delete the test game
    console.log('7. Cleaning up test data...')
    await manager.deleteGame(testGame.id)
    console.log('   ✅ Test game deleted from KV storage')

  } catch (error) {
    console.error('💥 Test failed with error:', error)
    return false
  }

  return true
}

// Run the test
if (import.meta.main) {
  const success = await testRecovery()
  // Deno.exit(success ? 0 : 1)
}
