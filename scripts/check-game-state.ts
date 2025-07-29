#!/usr/bin/env -S deno run --allow-env --allow-net --allow-write --unstable-kv

/**
 * Check current game state to verify pending effects persistence
 */

import { PersistenceManager } from '../src/persistence/mod.ts'
import { GameSession } from '../src/types/game.ts'

async function checkCurrentGameState() {
  console.log('🔍 Checking Current Game State')
  console.log('===============================')

  try {
    // Create memory store and persistence manager
    const memoryStore = new Map<number, GameSession>()
    const manager = new PersistenceManager(memoryStore)

    console.log('1. Initializing persistence manager...')
    await manager.init()

    // Get the recovered game ID from logs
    const gameId = -1002665696422

    console.log(`2. Loading game ${gameId}...`)
    const game = await manager.loadGame(gameId)

    if (!game) {
      console.log('   ❌ Game not found')
      return
    }

    console.log('✅ Game found!')
    console.log(`   State: ${game.state}`)
    console.log(`   Players: ${game.players.length}`)
    console.log(`   Current player: ${game.players[game.currentPlayerIndex].firstName} (index: ${game.currentPlayerIndex})`)

    if (game.pendingEffect) {
      console.log(`   🎲 Pending effect: ${game.pendingEffect.type} - ${game.pendingEffect.amount} cards`)
      console.log(`   🎯 Target: ${game.players[game.pendingEffect.targetPlayerIndex].firstName} (index: ${game.pendingEffect.targetPlayerIndex})`)
      console.log('   🔥 PENDING EFFECT PRESERVED THROUGH RESTART!')
    } else {
      console.log('   🎲 Pending effect: None')
    }

    // Show last played card
    if (game.lastPlayedCard) {
      console.log(`   🃏 Last played: ${game.lastPlayedCard.symbol} ${game.lastPlayedCard.number}${game.lastPlayedCard.isSpecial ? ' (special)' : ''}`)
    }

    // Show each player's hand size
    console.log('\n📋 Player Status:')
    game.players.forEach((player, index) => {
      const isCurrentPlayer = index === game.currentPlayerIndex
      const marker = isCurrentPlayer ? ' 👉' : '   '
      console.log(`${marker} ${player.firstName}: ${player.hand?.length || 0} cards`)
    })

  } catch (error) {
    console.error('💥 Error checking game state:', error)
  }
}

// Run the check
if (import.meta.main) {
  await checkCurrentGameState()
}
