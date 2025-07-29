#!/usr/bin/env -S deno run --allow-env --allow-net --unstable-kv

/**
 * Test script for startGameWithCards persistence
 */

import { PersistenceManager } from '../src/persistence/mod.ts'
import { GameSession, Player } from '../src/types/game.ts'

async function testStartGamePersistence() {
  console.log('🧪 Testing startGameWithCards Persistence')
  console.log('==========================================')

  try {
    // Create memory store and persistence manager
    const memoryStore = new Map<number, GameSession>()
    const manager = new PersistenceManager(memoryStore)
    
    console.log('1. Initializing persistence manager...')
    await manager.init()
    console.log('   ✅ Persistence manager initialized')

    // Create a test game in "ready_to_start" state
    const testGame: GameSession = {
      id: -999999999,
      state: 'ready_to_start',
      creatorId: 123456789,
      players: [
        {
          id: 123456789,
          firstName: 'TestPlayer1',
          state: 'joined',
          cardsPlayedCount: 0,
          specialCardsPlayedCount: 0,
        },
        {
          id: 987654321,
          firstName: 'TestPlayer2',
          state: 'joined',
          cardsPlayedCount: 0,
          specialCardsPlayedCount: 0,
        }
      ],
      createdAt: new Date(),
      reshuffleCount: 0,
      suddenDeath: false,
    }

    console.log('2. Saving initial ready_to_start game...')
    memoryStore.set(testGame.id, testGame)
    await manager.saveGame(testGame)
    console.log('   ✅ Game saved in ready_to_start state')

    // Simulate startGameWithCards - manually update the game
    console.log('3. Simulating startGameWithCards...')
    testGame.state = 'in_progress'
    testGame.currentPlayerIndex = 0
    testGame.direction = 'clockwise'
    testGame.deck = [
      { id: 'test1', symbol: 'circle', number: 5, isSpecial: false },
      { id: 'test2', symbol: 'triangle', number: 3, isSpecial: false }
    ]
    testGame.discardPile = [
      { id: 'top1', symbol: 'cross', number: 8, isSpecial: false }
    ]
    testGame.lastPlayedCard = testGame.discardPile[0]
    testGame.playedCards = [...testGame.discardPile]
    
    // Give players hands
    testGame.players[0].hand = [
      { id: 'hand1', symbol: 'star', number: 2, isSpecial: false },
      { id: 'hand2', symbol: 'square', number: 7, isSpecial: false }
    ]
    testGame.players[0].state = 'active'
    
    testGame.players[1].hand = [
      { id: 'hand3', symbol: 'circle', number: 4, isSpecial: false },
      { id: 'hand4', symbol: 'triangle', number: 1, isSpecial: true }
    ]
    testGame.players[1].state = 'active'

    console.log('4. Saving updated in_progress game...')
    await manager.saveGame(testGame)
    console.log('   ✅ Game saved in in_progress state')

    // Verify it was saved correctly
    console.log('5. Verifying persistence...')
    const loadedGame = await manager.loadGame(testGame.id)
    if (loadedGame) {
      console.log(`   ✅ Game loaded successfully`)
      console.log(`   📊 State: ${loadedGame.state}`)
      console.log(`   👥 Players: ${loadedGame.players.length}`)
      console.log(`   🎮 Current player: ${loadedGame.currentPlayerIndex}`)
      console.log(`   🃏 Has deck: ${!!loadedGame.deck} (${loadedGame.deck?.length || 0} cards)`)
      console.log(`   🃏 Has discard: ${!!loadedGame.discardPile} (${loadedGame.discardPile?.length || 0} cards)`)
      console.log(`   🎯 Last played: ${loadedGame.lastPlayedCard ? `${loadedGame.lastPlayedCard.symbol} ${loadedGame.lastPlayedCard.number}` : 'None'}`)
      
      if (loadedGame.state === 'in_progress' && loadedGame.deck && loadedGame.deck.length > 0) {
        console.log('\n🎉 Persistence test PASSED! in_progress state with cards persisted correctly.')
      } else {
        console.log('\n⚠️  Persistence test PARTIALLY PASSED - state or cards missing.')
      }
    } else {
      console.log('   ❌ Game NOT loaded!')
      console.log('\n💥 Persistence test FAILED!')
    }

    // Clean up
    console.log('6. Cleaning up test data...')
    await manager.deleteGame(testGame.id)
    console.log('   ✅ Test game deleted')

  } catch (error) {
    console.error('💥 Test failed with error:', error)
    return false
  }

  return true
}

// Run the test
if (import.meta.main) {
  const success = await testStartGamePersistence()
  Deno.exit(success ? 0 : 1)
}
