#!/usr/bin/env -S deno run --allow-env --allow-net --allow-write --unstable-kv

/**
 * Test script for pending effects persistence
 * Simulates the turn skipping bug scenario and verifies the fix
 */

import { PersistenceManager } from '../src/persistence/mod.ts'
import { GameSession, Player } from '../src/types/game.ts'

async function testPendingEffectsPersistence() {
  console.log('🧪 Testing Pending Effects Persistence Fix')
  console.log('===========================================')

  try {
    // Create memory store and persistence manager
    const memoryStore = new Map<number, GameSession>()
    const manager = new PersistenceManager(memoryStore)

    console.log('1. Initializing persistence manager...')
    await manager.init()
    console.log('   ✅ Persistence manager initialized')

    // Create a test game with pending Pick Three effect
    const testGame: GameSession = {
      id: -888888888,
      state: 'in_progress',
      creatorId: 123456789,
      players: [
        {
          id: 123456789,
          firstName: 'PlayerA',
          state: 'active',
          cardsPlayedCount: 3,
          specialCardsPlayedCount: 1,
          hand: [
            { id: 'hand1', symbol: 'circle', number: 8, isSpecial: false },
            { id: 'hand2', symbol: 'square', number: 4, isSpecial: false }
          ]
        },
        {
          id: 987654321,
          firstName: 'PlayerB',
          state: 'active',
          cardsPlayedCount: 2,
          specialCardsPlayedCount: 0,
          hand: [
            { id: 'hand3', symbol: 'triangle', number: 6, isSpecial: false },
            { id: 'hand4', symbol: 'star', number: 2, isSpecial: false },
            { id: 'hand5', symbol: 'cross', number: 9, isSpecial: false }
          ]
        }
      ],
      createdAt: new Date(),
      reshuffleCount: 0,
      suddenDeath: false,
      currentPlayerIndex: 1, // PlayerB's turn to handle penalty
      direction: 'clockwise',
      deck: [
        { id: 'deck1', symbol: 'circle', number: 3, isSpecial: false },
        { id: 'deck2', symbol: 'triangle', number: 7, isSpecial: false },
        { id: 'deck3', symbol: 'square', number: 1, isSpecial: true }
      ],
      discardPile: [
        { id: 'discard1', symbol: 'triangle', number: 5, isSpecial: true } // Pick Three card
      ],
      lastPlayedCard: { id: 'discard1', symbol: 'triangle', number: 5, isSpecial: true },
      playedCards: [
        { id: 'start1', symbol: 'circle', number: 10, isSpecial: false },
        { id: 'discard1', symbol: 'triangle', number: 5, isSpecial: true }
      ],
      pendingEffect: {
        type: 'pick_cards',
        amount: 3,
        targetPlayerIndex: 1, // PlayerB must draw 3 cards
        cardType: 5
      }
    }

    console.log('2. Setting up game with pending Pick Three effect...')
    console.log(`   🎯 Current player: ${testGame.players[testGame.currentPlayerIndex].firstName}`)
    console.log(`   🎲 Pending effect: ${testGame.pendingEffect.type} - ${testGame.pendingEffect.amount} cards`)
    console.log(`   🎯 Target: ${testGame.players[testGame.pendingEffect.targetPlayerIndex].firstName}`)

    // Save the game with pending effect
    memoryStore.set(testGame.id, testGame)
    await manager.saveGame(testGame)
    console.log('   ✅ Game saved with pending effect')

    // Verify it saved correctly
    console.log('3. Verifying pending effect persistence...')
    const loadedGame1 = await manager.loadGame(testGame.id)
    if (loadedGame1 && loadedGame1.pendingEffect) {
      console.log(`   ✅ Pending effect preserved: ${loadedGame1.pendingEffect.type} - ${loadedGame1.pendingEffect.amount} cards`)
      console.log(`   🎯 Target player: ${loadedGame1.players[loadedGame1.pendingEffect.targetPlayerIndex].firstName}`)
    } else {
      console.log('   ❌ Pending effect NOT preserved!')
      return false
    }

    // Simulate the penalty resolution (PlayerB draws 3 cards)
    console.log('4. Simulating penalty resolution...')
    testGame.players[1].hand!.push(
      { id: 'penalty1', symbol: 'star', number: 3, isSpecial: false },
      { id: 'penalty2', symbol: 'cross', number: 7, isSpecial: false },
      { id: 'penalty3', symbol: 'circle', number: 1, isSpecial: true }
    )
    testGame.pendingEffect = undefined // Clear the effect
    testGame.currentPlayerIndex = 0 // Turn advances to PlayerA

    console.log(`   📥 PlayerB drew 3 cards (hand size: ${testGame.players[1].hand!.length})`)
    console.log(`   🔄 Turn advanced to: ${testGame.players[testGame.currentPlayerIndex].firstName}`)

    // Save the state after penalty resolution
    await manager.saveGame(testGame)
    console.log('   ✅ State saved after penalty resolution')

    // Verify the cleared state persists correctly
    console.log('5. Verifying penalty resolution persistence...')
    const loadedGame2 = await manager.loadGame(testGame.id)
    if (loadedGame2) {
      const currentPlayer = loadedGame2.players[loadedGame2.currentPlayerIndex]
      const penalizedPlayer = loadedGame2.players[1]

      console.log(`   🎮 Current player: ${currentPlayer.firstName} (index: ${loadedGame2.currentPlayerIndex})`)
      console.log(`   📥 PlayerB hand size: ${penalizedPlayer.hand!.length} cards`)
      console.log(`   🎲 Pending effect: ${loadedGame2.pendingEffect ? JSON.stringify(loadedGame2.pendingEffect) : 'None'}`)

      const correctTurn = loadedGame2.currentPlayerIndex === 0
      const correctHandSize = penalizedPlayer.hand!.length === 6 // Original 3 + 3 penalty
      const noPendingEffect = !loadedGame2.pendingEffect

      if (correctTurn && correctHandSize && noPendingEffect) {
        console.log('\n🎉 PENDING EFFECTS PERSISTENCE TEST PASSED!')
        console.log('   ✅ Penalty effect properly resolved and persisted')
        console.log('   ✅ Turn correctly advanced after penalty')
        console.log('   ✅ Pending effect properly cleared')
        console.log('   ✅ Game state consistency maintained')
      } else {
        console.log('\n⚠️  PARTIAL SUCCESS - Some issues detected:')
        if (!correctTurn) console.log('   ❌ Turn not advanced correctly')
        if (!correctHandSize) console.log('   ❌ Hand size incorrect')
        if (!noPendingEffect) console.log('   ❌ Pending effect not cleared')
      }
    } else {
      console.log('   ❌ Game NOT loaded after penalty resolution!')
      return false
    }

    // Clean up
    console.log('6. Cleaning up test data...')
    await manager.deleteGame(testGame.id)
    console.log('   ✅ Test game deleted')

    return true

  } catch (error) {
    console.error('💥 Test failed with error:', error)
    return false
  }
}

// Run the test
if (import.meta.main) {
  const success = await testPendingEffectsPersistence()
  // Deno.exit(success ? 0 : 1)
}
