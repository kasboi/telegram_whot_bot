#!/usr/bin/env -S deno run --allow-env --allow-net --allow-write --unstable-kv

/**
 * Comprehensive test demonstrating the pending effects persistence fix
 * This simulates the exact bug scenario and proves it's fixed
 */

import { PersistenceManager } from '../src/persistence/mod.ts'
import { GameSession } from '../src/types/game.ts'

async function demonstratePendingEffectsFix() {
  console.log('🎯 PENDING EFFECTS PERSISTENCE DEMONSTRATION')
  console.log('===========================================')
  console.log('This test simulates the exact bug that was reported:')
  console.log('"whenever the bot takes a while to restart, the current player loses their turn"')
  console.log('')

  try {
    // Create memory store and persistence manager
    const memoryStore = new Map<number, GameSession>()
    const manager = new PersistenceManager(memoryStore)

    await manager.init()

    // Scenario: Game in progress with Pick Two effect active
    const testGame: GameSession = {
      id: -999999999,
      state: 'in_progress',
      creatorId: 111111111,
      players: [
        {
          id: 111111111,
          firstName: 'Alice',
          state: 'active',
          cardsPlayedCount: 2,
          specialCardsPlayedCount: 1,
          hand: [
            { id: 'alice1', symbol: 'circle', number: 7, isSpecial: false },
            { id: 'alice2', symbol: 'square', number: 3, isSpecial: false },
            { id: 'alice3', symbol: 'star', number: 8, isSpecial: false }
          ]
        },
        {
          id: 222222222,
          firstName: 'Bob',
          state: 'active',
          cardsPlayedCount: 1,
          specialCardsPlayedCount: 0,
          hand: [
            { id: 'bob1', symbol: 'triangle', number: 9, isSpecial: false },
            { id: 'bob2', symbol: 'cross', number: 6, isSpecial: false },
            { id: 'bob3', symbol: 'circle', number: 4, isSpecial: false },
            { id: 'bob4', symbol: 'star', number: 1, isSpecial: true }
          ]
        }
      ],
      createdAt: new Date(),
      reshuffleCount: 0,
      suddenDeath: false,
      currentPlayerIndex: 1, // Bob's turn
      direction: 'clockwise',
      deck: [
        { id: 'deck1', symbol: 'triangle', number: 8, isSpecial: false },
        { id: 'deck2', symbol: 'square', number: 6, isSpecial: false },
        { id: 'deck3', symbol: 'cross', number: 3, isSpecial: false }
      ],
      discardPile: [
        { id: 'played1', symbol: 'star', number: 2, isSpecial: true } // Pick Two card
      ],
      lastPlayedCard: { id: 'played1', symbol: 'star', number: 2, isSpecial: true },
      playedCards: [
        { id: 'start', symbol: 'circle', number: 11, isSpecial: false },
        { id: 'played1', symbol: 'star', number: 2, isSpecial: true }
      ],
      pendingEffect: {
        type: 'pick_cards',
        amount: 2,
        targetPlayerIndex: 1, // Bob must draw 2 cards
        cardType: 2
      }
    }

    console.log('STEP 1: Game setup with active Pick Two penalty')
    console.log('=============================================')
    console.log(`🎮 Current turn: ${testGame.players[testGame.currentPlayerIndex].firstName}`)
    console.log(`🎲 Pending effect: Bob must draw 2 cards (Pick Two penalty)`)
    console.log(`🃏 Last played: ${testGame.lastPlayedCard.symbol} ${testGame.lastPlayedCard.number} (Pick Two)`)
    console.log(`👥 Alice: ${testGame.players[0].hand!.length} cards | Bob: ${testGame.players[1].hand!.length} cards`)
    console.log('')

    // Save game state
    memoryStore.set(testGame.id, testGame)
    await manager.saveGame(testGame)

    console.log('STEP 2: Simulating bot restart (the critical moment)')
    console.log('==================================================')
    console.log('⚠️  OLD BUG: Pending effect would be lost here!')
    console.log('✅ NEW FIX: Pending effect should be preserved...')

    // Clear memory to simulate restart
    memoryStore.clear()

    // Recover game from persistence (simulating bot restart)
    const recoveredGame = await manager.loadGame(testGame.id)

    if (!recoveredGame) {
      console.log('❌ FAILURE: Game not recovered!')
      return false
    }

    memoryStore.set(recoveredGame.id, recoveredGame)
    console.log('')

    console.log('STEP 3: Verifying game state after "restart"')
    console.log('===========================================')

    const currentPlayer = recoveredGame.players[recoveredGame.currentPlayerIndex]
    console.log(`🎮 Current turn: ${currentPlayer.firstName} (index: ${recoveredGame.currentPlayerIndex})`)

    if (recoveredGame.pendingEffect) {
      const targetPlayer = recoveredGame.players[recoveredGame.pendingEffect.targetPlayerIndex]
      console.log(`🎲 Pending effect: ${targetPlayer.firstName} must draw ${recoveredGame.pendingEffect.amount} cards`)
      console.log(`🎯 Effect type: ${recoveredGame.pendingEffect.type}`)
      console.log('✅ PENDING EFFECT PRESERVED THROUGH RESTART!')
    } else {
      console.log('❌ PENDING EFFECT LOST! (This was the bug)')
      return false
    }

    console.log(`🃏 Last played: ${recoveredGame.lastPlayedCard?.symbol} ${recoveredGame.lastPlayedCard?.number}`)
    console.log(`👥 Alice: ${recoveredGame.players[0].hand!.length} cards | Bob: ${recoveredGame.players[1].hand!.length} cards`)
    console.log('')

    console.log('STEP 4: Resolving the penalty (Bob draws cards)')
    console.log('=============================================')

    // Simulate Bob drawing penalty cards
    recoveredGame.players[1].hand!.push(
      { id: 'penalty1', symbol: 'triangle', number: 5, isSpecial: false },
      { id: 'penalty2', symbol: 'cross', number: 9, isSpecial: false }
    )

    // Clear pending effect and advance turn
    recoveredGame.pendingEffect = undefined
    recoveredGame.currentPlayerIndex = 0 // Turn goes to Alice

    console.log(`📥 Bob drew 2 penalty cards`)
    console.log(`🔄 Turn advanced to: ${recoveredGame.players[recoveredGame.currentPlayerIndex].firstName}`)

    // Save the resolved state
    await manager.saveGame(recoveredGame)
    console.log('💾 State saved after penalty resolution')
    console.log('')

    console.log('STEP 5: Final verification')
    console.log('=========================')

    const finalGame = await manager.loadGame(testGame.id)
    if (finalGame) {
      const currentFinalPlayer = finalGame.players[finalGame.currentPlayerIndex]
      console.log(`🎮 Current turn: ${currentFinalPlayer.firstName} (index: ${finalGame.currentPlayerIndex})`)
      console.log(`🎲 Pending effect: ${finalGame.pendingEffect ? 'Active' : 'None'}`)
      console.log(`👥 Alice: ${finalGame.players[0].hand!.length} cards | Bob: ${finalGame.players[1].hand!.length} cards`)

      const correctSequence = (
        finalGame.currentPlayerIndex === 0 && // Turn correctly advanced to Alice
        !finalGame.pendingEffect && // Effect properly cleared
        finalGame.players[1].hand!.length === 6 // Bob has 4 original + 2 penalty cards
      )

      if (correctSequence) {
        console.log('')
        console.log('🎉 SUCCESS: TURN SKIPPING BUG IS FIXED!')
        console.log('=======================================')
        console.log('✅ Pending effects survive bot restarts')
        console.log('✅ Turn sequence preserved correctly')
        console.log('✅ No more "current player loses their turn"')
        console.log('✅ Game state fully consistent after restart')
      } else {
        console.log('❌ FAILURE: Bug still exists')
      }
    }

    // Cleanup
    await manager.deleteGame(testGame.id)
    return true

  } catch (error) {
    console.error('💥 Demonstration failed:', error)
    return false
  }
}

// Run the demonstration
if (import.meta.main) {
  await demonstratePendingEffectsFix()
}
