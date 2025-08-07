import { GameSession, Player, Card } from '../types/game.ts'
import { logger } from '../utils/logger.ts'
import { createDeck, dealCards, canPlayCardWithChosen } from './cards.ts'
import { getCardEffect, canPlayDuringEffect } from './special.ts'
import { PersistenceManager } from '../persistence/mod.ts'

// Global game state storage (in-memory for MVP)
export const gameState = new Map<number, GameSession>()

/**
 * Get access to the memory store for utility functions
 */
export function getMemoryStore(): Map<number, GameSession> {
  return gameState
}

// Persistence manager for gradual migration
let persistenceManager: PersistenceManager | null = null

/**
 * Initialize persistence with dual-write mode (KV + existing memory)
 * Also recovers any existing games from KV storage
 */
export async function initPersistence(): Promise<void> {
  try {
    persistenceManager = new PersistenceManager(gameState)
    await persistenceManager.init()

    // Recover any existing games from KV storage
    const recoveryResult = await persistenceManager.recoverGamesFromKV()
    if (recoveryResult.recovered > 0) {
      logger.info('Successfully recovered games from persistence', {
        recovered: recoveryResult.recovered,
        failed: recoveryResult.failed,
        totalInMemory: gameState.size
      })
    } else if (recoveryResult.failed > 0) {
      logger.warn('Some games failed to recover from persistence', {
        failed: recoveryResult.failed
      })
    } else {
      logger.info('No games found in persistence to recover')
    }

    logger.info('Persistence manager initialized in dual-write mode', {
      mode: persistenceManager.getMode(),
      gamesInMemory: gameState.size
    })
  } catch (error) {
    logger.error('Failed to initialize persistence manager', {
      error: error instanceof Error ? error.message : String(error)
    })
    // Continue without persistence for now
  }
}

/**
 * Get the persistence manager instance for admin operations
 */
export function getPersistenceManager(): PersistenceManager | null {
  return persistenceManager
}

/**
 * Save game to persistence layer (non-blocking)
 */
async function saveGameToPersistence(game: GameSession): Promise<void> {
  logger.debug('saveGameToPersistence called', {
    groupChatId: game.id,
    state: game.state,
    hasPersistenceManager: !!persistenceManager
  })

  if (!persistenceManager) {
    logger.debug('No persistence manager available')
    return
  }

  try {
    await persistenceManager.saveGame(game)
    logger.debug('Game saved to persistence successfully', {
      groupChatId: game.id,
      state: game.state
    })
  } catch (error) {
    logger.warn('Failed to persist game state', {
      groupChatId: game.id,
      error: error instanceof Error ? error.message : String(error)
    })
    // Don't throw - game continues in memory
  }
}

/**
 * Calculates the point value of a player's hand for Tender mode.
 * - Star cards are worth double points.
 * - Whot cards are worth 20 points.
 */
function calculateHandValue(hand: Card[]): number {
  return hand.reduce((total, card) => {
    if (card.symbol === 'star') {
      return total + card.number * 2
    }
    return total + card.number
  }, 0)
}

export function createGame(groupChatId: number, creatorId: number, creatorName: string): GameSession {
  const newGame: GameSession = {
    id: groupChatId,
    state: 'waiting_for_players',
    creatorId,
    players: [],
    createdAt: new Date(),
  }

  gameState.set(groupChatId, newGame)

  // Persist to KV store (non-blocking)
  saveGameToPersistence(newGame).catch(error => {
    logger.warn('Failed to persist new game', { groupChatId, error })
  })

  logger.info('Game created', {
    groupChatId,
    creatorId,
    creatorName,
    timestamp: new Date().toISOString()
  })
  return newGame
}

export function getGame(groupChatId: number): GameSession | undefined {
  return gameState.get(groupChatId)
}

export function addPlayer(groupChatId: number, userId: number, firstName: string): boolean {
  const game = gameState.get(groupChatId)
  if (!game) {
    logger.warn('Attempted to join non-existent game', { groupChatId, userId })
    return false
  }

  // Allow joining in both waiting_for_players and ready_to_start states
  if (game.state !== 'waiting_for_players' && game.state !== 'ready_to_start') {
    logger.warn('Attempted to join game in invalid state', { groupChatId, userId, gameState: game.state })
    return false
  }

  // Check if player already joined
  if (game.players.some((p: Player) => p.id === userId)) {
    logger.warn('Player already joined game', { groupChatId, userId })
    return false
  }

  const newPlayer: Player = {
    id: userId,
    firstName,
    state: 'joined',
    cardsPlayedCount: 0,
    specialCardsPlayedCount: 0,
  }

  game.players.push(newPlayer)

  // Game ready to start if we have 2+ players
  if (game.players.length >= 2) {
    game.state = 'ready_to_start'
    logger.info('Game state: ready_to_start', {
      groupChatId,
      totalPlayers: game.players.length,
      players: game.players.map((p: Player) => p.firstName)
    })
  }

  // Persist updated game state
  saveGameToPersistence(game).catch(error => {
    logger.warn('Failed to persist player addition', { groupChatId, userId, error })
  })

  logger.info('Player joined game', {
    groupChatId,
    userId,
    firstName,
    totalPlayers: game.players.length,
    playersList: game.players.map((p: Player) => p.firstName)
  })

  return true
}

export function canStartGame(groupChatId: number, userId: number): boolean {
  const game = gameState.get(groupChatId)
  return game !== undefined &&
    game.state === 'ready_to_start' &&
    game.creatorId === userId &&
    game.players.length >= 2
}

export function clearGame(groupChatId: number): boolean {
  const game = gameState.get(groupChatId)
  if (!game) {
    return false
  }

  // Cancel all timers for this game before clearing (non-blocking)
  try {
    // Use dynamic import to avoid circular dependency issues
    import('./timeouts.ts').then(({ getTimeoutManager }) => {
      try {
        const timeoutManager = getTimeoutManager()
        timeoutManager.cancelAllTimers(groupChatId)
        logger.debug('Cancelled all timers for game', { groupChatId })
      } catch (_error) {
        logger.debug('Timeout manager not available during game clear', { groupChatId })
      }
    }).catch(() => {
      // Ignore import errors - timeout manager might not be available
      logger.debug('Could not import timeout manager during game clear', { groupChatId })
    })
  } catch (error) {
    // Ignore any errors - game clearing should not fail due to timer issues
    logger.debug('Timer cancellation failed during game clear', {
      groupChatId,
      error: error instanceof Error ? error.message : String(error)
    })
  }

  gameState.delete(groupChatId)

  // Also delete from persistence
  if (persistenceManager) {
    persistenceManager.deleteGame(groupChatId).catch(error => {
      logger.warn('Failed to delete game from persistence', { groupChatId, error })
    })
  }

  logger.info('Game cleared', { groupChatId, state: game.state, players: game.players.length })
  return true
}

export function getGameStats(): { totalGames: number; gameStates: Record<string, number> } {
  const games = Array.from(gameState.values())
  const totalGames = games.length
  const gameStates: Record<string, number> = {}

  games.forEach(game => {
    gameStates[game.state] = (gameStates[game.state] || 0) + 1
  })

  return { totalGames, gameStates }
}

// ======================================
// DECK EXHAUSTION SAFETY FUNCTIONS
// ======================================

/**
 * TENDER-ONLY MODE: Ensures deck has cards, triggers immediate tender if exhausted
 * No reshuffling - game ends immediately when deck is empty
 */
function ensureDeckHasCards(game: GameSession, cardsNeeded: number): { hasEnoughCards: boolean, gameEnded?: boolean, tenderResult?: { winner?: Player; scores: { name: string; score: number }[]; tie?: boolean; tiedPlayers?: string[] } } {
  if (game.deck!.length >= cardsNeeded) {
    return { hasEnoughCards: true }
  }

  logger.info('Deck exhaustion detected - triggering immediate tender mode', {
    groupChatId: game.id,
    cardsInDeck: game.deck!.length,
    cardsNeeded,
    mode: 'tender-only'
  })

  // TENDER-ONLY MODE: No reshuffling, immediate game end
  const scores = game.players.map((p: Player) => ({
    name: p.firstName,
    score: calculateHandValue(p.hand || []),
    player: p,
  }))

  scores.sort((a, b) => a.score - b.score)

  // Handle ties - check if multiple players have the same lowest score
  const lowestScore = scores[0].score
  const winners = scores.filter(s => s.score === lowestScore)

  if (winners.length > 1) {
    // It's a tie/draw
    game.state = 'ended'
    game.tieResult = winners.map(w => w.player)
    logger.info('Game ended by deck exhaustion - TIE GAME', {
      groupChatId: game.id,
      tiedPlayers: winners.map(w => w.name),
      score: lowestScore
    })
    return {
      hasEnoughCards: false,
      gameEnded: true,
      tenderResult: {
        scores: scores.map(s => ({ name: s.name, score: s.score })),
        tie: true,
        tiedPlayers: winners.map(w => w.name)
      }
    }
  } else {
    // Single winner
    game.winner = scores[0].player
    game.state = 'ended'
    logger.info('Game ended by deck exhaustion - tender mode', {
      groupChatId: game.id,
      winner: game.winner.firstName,
      winningScore: lowestScore
    })
    return {
      hasEnoughCards: false,
      gameEnded: true,
      tenderResult: {
        winner: game.winner,
        scores: scores.map(s => ({ name: s.name, score: s.score }))
      }
    }
  }
}

/**
 * TENDER-ONLY MODE: Safely draws cards for a player, triggers tender if deck exhausted
 */
function safeDrawCards(game: GameSession, playerIndex: number, count: number): { cardsDrawn: number, gameEnded?: boolean, tenderResult?: { winner?: Player; scores: { name: string; score: number }[]; tie?: boolean; tiedPlayers?: string[] } } {
  const deckCheck = ensureDeckHasCards(game, count)
  if (deckCheck.gameEnded) {
    return { cardsDrawn: 0, gameEnded: true, tenderResult: deckCheck.tenderResult }
  }
  if (!deckCheck.hasEnoughCards) {
    // Can only draw what's available before triggering tender
    count = game.deck!.length
    logger.info('Partial draw due to deck exhaustion', {
      groupChatId: game.id,
      playerIndex,
      cardsAvailable: count
    })
  }

  let drawn = 0
  for (let i = 0; i < count && game.deck!.length > 0; i++) {
    const card = game.deck!.pop()
    if (card) {
      game.players[playerIndex].hand!.push(card)
      drawn++
    }
  }

  logger.info('Cards drawn in tender-only mode', {
    groupChatId: game.id,
    playerIndex,
    cardsDrawn: drawn,
    remainingInDeck: game.deck!.length
  })

  return { cardsDrawn: drawn }
}

// Stage 2: Start the actual game with cards
export function startGameWithCards(groupChatId: number): boolean {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'ready_to_start') {
    logger.warn('Attempted to start game with cards in invalid state', { groupChatId, gameState: game?.state })
    return false
  }

  // Create and deal cards
  const deck = createDeck()
  const { playerHands, remainingDeck, discardPile } = dealCards(deck, game.players.length)

  // Update game state
  game.state = 'in_progress'
  game.deck = remainingDeck
  game.discardPile = discardPile
  game.lastPlayedCard = discardPile[0] // Set the top card as the last played card
  game.playedCards = [...discardPile] // Initialize played cards with the starting card
  game.currentPlayerIndex = 0
  game.direction = 'clockwise'

  // Assign cards to players and set them as active
  game.players.forEach((player, index) => {
    player.hand = playerHands[index]
    player.state = 'active'
  })

  logger.info('Game state: in_progress', {
    groupChatId,
    totalPlayers: game.players.length,
    cardsInDeck: remainingDeck.length,
    topCard: { id: discardPile[0]?.id, symbol: discardPile[0]?.symbol, number: discardPile[0]?.number },
    currentPlayer: game.players[0]?.firstName,
    playerHands: game.players.map((p: Player) => ({ name: p.firstName, cardCount: p.hand?.length || 0 }))
  })

  // Persist the game state with cards to KV storage
  logger.debug('Attempting to persist game start', {
    groupChatId,
    hasPersistenceManager: !!persistenceManager,
    gameState: game.state
  })

  saveGameToPersistence(game).catch(error => {
    logger.warn('Failed to persist game start', { groupChatId, error })
  })

  return true
}

// Get current player
export function getCurrentPlayer(groupChatId: number): Player | undefined {
  const game = gameState.get(groupChatId)
  if (!game || game.currentPlayerIndex === undefined) {
    return undefined
  }

  return game.players[game.currentPlayerIndex]
}

// Get top card from discard pile
export function getTopCard(groupChatId: number) {
  const game = gameState.get(groupChatId)
  if (!game || !game.discardPile || game.discardPile.length === 0) {
    return undefined
  }

  return game.discardPile[game.discardPile.length - 1]
}

// Play a card from player's hand
export function playCard(groupChatId: number, userId: number, cardIndex: number): {
  success: boolean
  message: string
  gameEnded?: boolean
  winner?: Player
  requiresSymbolChoice?: boolean
  reshuffled?: boolean
} {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return { success: false, message: "No active game found" }
  }

  const player = game.players.find((p: Player) => p.id === userId)
  if (!player) {
    return { success: false, message: "Player not found in this game" }
  }

  if (game.currentPlayerIndex !== game.players.indexOf(player)) {
    return { success: false, message: "It's not your turn" }
  }

  if (!player.hand || cardIndex < 0 || cardIndex >= player.hand.length) {
    return { success: false, message: "Invalid card index" }
  }

  const cardToPlay = player.hand[cardIndex]

  // Check if this is a valid play (considering pending effects)
  const canPlay = game.pendingEffect
    ? canPlayDuringEffect(cardToPlay, game.pendingEffect)
    : canPlayCardWithChosen(cardToPlay, game.lastPlayedCard!, game.chosenSymbol)

  if (!canPlay) {
    const lastCard = game.lastPlayedCard!
    return {
      success: false,
      message: game.pendingEffect
        ? `You must play a card that can stack with the pending ${game.pendingEffect.type} effect`
        : `You can only play a card that matches the symbol (${lastCard.symbol}) or number (${lastCard.number}), or play a Whot card`
    }
  }

  // Remove card from player's hand and add to played cards
  player.hand.splice(cardIndex, 1)
  game.lastPlayedCard = cardToPlay
  if (!game.playedCards) game.playedCards = []
  game.playedCards.push(cardToPlay)

  // Increment player stats
  player.cardsPlayedCount = (player.cardsPlayedCount || 0) + 1
  if (cardToPlay.isSpecial) {
    player.specialCardsPlayedCount = (player.specialCardsPlayedCount || 0) + 1
  }

  // Clear chosen symbol when a non-Whot card is played
  if (cardToPlay.symbol !== 'whot' && game.chosenSymbol) {
    game.chosenSymbol = undefined
  }

  // Update discard pile to reflect the new top card
  if (!game.discardPile) game.discardPile = []
  game.discardPile.push(cardToPlay)

  // Handle special card effects
  const effect = getCardEffect(cardToPlay)
  let effectDescription = ''

  if (effect) {
    if (effect.type === 'pick_cards') {
      // If there's already a pending pick effect and this card stacks, add to it
      if (game.pendingEffect && game.pendingEffect.type === 'pick_cards') {
        // Validate that only the same type of card can stack
        if (game.pendingEffect.cardType && game.pendingEffect.cardType !== cardToPlay.number) {
          return {
            success: false,
            message: `You can only counter with ${game.pendingEffect.cardType === 2 ? 'Pick Two' : 'Pick Three'} cards or Whot cards`
          }
        }

        const previousAmount = game.pendingEffect.amount
        game.pendingEffect.amount += effect.pickAmount!
        // CRITICAL FIX: Update targetPlayerIndex when stacking
        game.pendingEffect.targetPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        effectDescription = `Stacked pick effect: ${previousAmount} + ${effect.pickAmount} = ${game.pendingEffect.amount} cards to ${game.players[game.pendingEffect.targetPlayerIndex].firstName}`
      } else {
        game.pendingEffect = {
          type: 'pick_cards',
          amount: effect.pickAmount!,
          targetPlayerIndex: (game.currentPlayerIndex + 1) % game.players.length,
          cardType: cardToPlay.number // Track what type of card initiated this effect
        }
        const targetPlayerName = game.pendingEffect &&
          typeof game.pendingEffect.targetPlayerIndex === 'number' &&
          game.pendingEffect.targetPlayerIndex < game.players.length
          ? game.players[game.pendingEffect.targetPlayerIndex].firstName
          : 'next player'
        effectDescription = `Applied pick effect: ${effect.pickAmount} cards to ${targetPlayerName}`
      }
    } else if (effect.type === 'extra_turn') {
      effectDescription = 'Hold On - Player gets extra turn'
    } else if (effect.type === 'skip_turn') {
      // Skip the next player
      const skippedPlayer = game.players[(game.currentPlayerIndex + 1) % game.players.length]
      game.currentPlayerIndex = (game.currentPlayerIndex + 2) % game.players.length
      effectDescription = `Suspension - Skipped ${skippedPlayer.firstName}'s turn`
    } else if (effect.type === 'general_market') {
      // All other players draw one card using safe drawing
      const playersWhoGotCards = []
      const playersNeedingCards = game.players.length - 1

      // Check if we can provide cards to all players - trigger tender immediately if not
      const deckCheck = ensureDeckHasCards(game, playersNeedingCards)
      if (deckCheck.gameEnded) {
        return {
          success: true,
          message: '🎯 Tender Mode! The deck ran out of cards during General Market.',
          gameEnded: true,
          winner: deckCheck.tenderResult?.winner,
          reshuffled: false,
        }
      }

      // Safe drawing for each player
      for (let i = 0; i < game.players.length; i++) {
        if (i !== game.currentPlayerIndex) {
          const drawResult = safeDrawCards(game, i, 1)
          if (drawResult.gameEnded) {
            return {
              success: true,
              message: '🎯 Tender Mode! The deck ran out of cards during General Market.',
              gameEnded: true,
              winner: drawResult.tenderResult?.winner,
              reshuffled: false,
            }
          }
          if (drawResult.cardsDrawn > 0) {
            playersWhoGotCards.push(game.players[i].firstName)
          }
        }
      }
      effectDescription = `General Market - ${playersWhoGotCards.join(', ')} drew cards`
    } else if (effect.type === 'choose_symbol') {
      effectDescription = 'Whot - Requires symbol selection'

      logger.info('Card played', {
        groupChatId,
        player: player.firstName,
        card: { symbol: cardToPlay.symbol, number: cardToPlay.number, id: cardToPlay.id },
        effect: effectDescription,
        remainingCards: player.hand!.length,
        requiresSymbolChoice: true
      })

      return { success: true, message: `Played ${cardToPlay.symbol} ${cardToPlay.number}`, requiresSymbolChoice: true, reshuffled: false }
    }
  }

  // Check if player won
  if (player.hand!.length === 0) {
    game.state = 'ended'
    game.winner = player
    logger.info('Game ended', {
      groupChatId,
      winner: player.firstName,
      finalPlayerCounts: game.players.map((p: Player) => ({ name: p.firstName, cards: p.hand?.length || 0 })),
      totalTurns: game.playedCards?.length || 0
    })
    return { success: true, message: `${player.firstName} wins!`, gameEnded: true, winner: player, reshuffled: false }
  }

  // Advance turn only if it's not a Hold On card or General Market
  let nextPlayer = ''
  if (!effect || (effect.type !== 'extra_turn' && effect.type !== 'general_market')) {
    // If there's a pending effect and the next player must handle it
    if (game.pendingEffect && game.pendingEffect.type === 'pick_cards') {
      game.currentPlayerIndex = game.pendingEffect.targetPlayerIndex!
    } else if (effect?.type !== 'skip_turn') {
      // Normal turn advancement (skip_turn already handled above)
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
    }
    nextPlayer = game.players[game.currentPlayerIndex].firstName
  } else {
    nextPlayer = player.firstName // Same player keeps turn (Hold On or General Market)
  }

  logger.info('Card played', {
    groupChatId,
    player: player.firstName,
    card: { symbol: cardToPlay.symbol, number: cardToPlay.number, id: cardToPlay.id },
    effect: effectDescription || 'None',
    remainingCards: player.hand!.length,
    nextPlayer,
    pendingEffect: game.pendingEffect ? `${game.pendingEffect.type}: ${game.pendingEffect.amount}` : 'None'
  })

  // Persist the updated game state (including pending effects)
  saveGameToPersistence(game).catch(error => {
    logger.warn('Failed to persist card play state', { groupChatId, error })
  })

  const cardDescription = cardToPlay.number === 20 ? 'Whot' : `${cardToPlay.symbol} ${cardToPlay.number}`
  return { success: true, message: `Played ${cardDescription}`, reshuffled: false }
}

// Draw a card from the deck
export function drawCard(groupChatId: number, userId: number): {
  success: boolean
  message: string
  cardDrawn?: Card
  gameEnded?: boolean
  reshuffled?: boolean
  tenderResult?: { winner?: Player; scores: { name: string; score: number }[]; tie?: boolean; tiedPlayers?: string[] }
} {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return { success: false, message: 'No active game found' }
  }

  const player = game.players.find((p: Player) => p.id === userId)
  if (!player) {
    return { success: false, message: 'Player not found in this game' }
  }

  const playerIndex = game.players.indexOf(player)
  if (game.currentPlayerIndex !== playerIndex) {
    return { success: false, message: "It's not your turn" }
  }

  // Handle pending effects first (Pick Two/Three cards)
  if (game.pendingEffect && game.pendingEffect.type === 'pick_cards') {
    const cardsToDraw = game.pendingEffect.amount

    // For penalty effects, try to draw what's available, then trigger tender if needed
    const deckCheck = ensureDeckHasCards(game, cardsToDraw)

    if (deckCheck.gameEnded) {
      return {
        success: true,
        message: '🎯 Tender Mode! The deck ran out of cards during penalty draw.',
        gameEnded: true,
        tenderResult: deckCheck.tenderResult,
      }
    }

    // Draw whatever cards are available (could be less than requested)
    const drawResult = safeDrawCards(game, playerIndex, cardsToDraw)

    if (drawResult.gameEnded) {
      return {
        success: true,
        message: '🎯 Tender Mode! The deck ran out of cards during penalty draw.',
        gameEnded: true,
        tenderResult: drawResult.tenderResult,
      }
    }

    game.pendingEffect = undefined
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length

    logger.info('Penalty cards drawn in tender mode', {
      groupChatId,
      player: player.firstName,
      cardsDrawn: drawResult.cardsDrawn,
      requested: cardsToDraw,
      newHandSize: player.hand!.length
    })

    // Persist the state after clearing pending effect
    saveGameToPersistence(game).catch(error => {
      logger.warn('Failed to persist penalty resolution state', { groupChatId, error })
    })

    return {
      success: true,
      message: drawResult.cardsDrawn > 0 ? `Drew ${drawResult.cardsDrawn} cards due to penalty effect` : 'No cards available to draw - triggering tender',
      cardDrawn: drawResult.cardsDrawn > 0 ? player.hand![player.hand!.length - 1] : undefined,
      reshuffled: false, // No more reshuffling in tender-only mode
    }
  }

  // Normal card draw
  const drawResult = safeDrawCards(game, playerIndex, 1)

  if (drawResult.gameEnded) {
    return {
      success: true,
      message: '🎯 Tender Mode! The deck ran out of cards.',
      gameEnded: true,
      tenderResult: drawResult.tenderResult,
    }
  }

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length

  logger.info('Card drawn in tender mode', { groupChatId, player: player.firstName, newHandSize: player.hand!.length })

  // Persist the updated game state
  saveGameToPersistence(game).catch(error => {
    logger.warn('Failed to persist card draw state', { groupChatId, error })
  })

  return {
    success: true,
    message: drawResult.cardsDrawn > 0 ? 'Drew a card' : 'No cards available to draw',
    cardDrawn: drawResult.cardsDrawn > 0 ? player.hand![player.hand!.length - 1] : undefined,
    reshuffled: false // No more reshuffling in tender-only mode
  }
}

// Handle Whot symbol selection
export function selectWhotSymbol(groupChatId: number, userId: number, selectedSymbol: string): { success: boolean; message: string } {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return { success: false, message: "No active game found" }
  }

  const player = game.players.find((p: Player) => p.id === userId)
  if (!player) {
    return { success: false, message: "Player not found in this game" }
  }

  if (game.currentPlayerIndex !== game.players.indexOf(player)) {
    return { success: false, message: "It's not your turn" }
  }

  // Validate symbol
  const validSymbols = ['circle', 'triangle', 'cross', 'square', 'star']
  if (!validSymbols.includes(selectedSymbol)) {
    return { success: false, message: "Invalid symbol selected" }
  }

  // Update the last played card's symbol (treat Whot as having the chosen symbol)
  if (game.lastPlayedCard && game.lastPlayedCard.number === 20) {
    game.chosenSymbol = selectedSymbol

    // Now advance the turn
    const nextPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
    game.currentPlayerIndex = nextPlayerIndex
    const nextPlayer = game.players[nextPlayerIndex]

    logger.info('Whot symbol selected', {
      groupChatId,
      player: player.firstName,
      selectedSymbol,
      nextPlayer: nextPlayer.firstName,
      chosenSymbolActive: true
    })

    // Persist the symbol selection and turn change
    saveGameToPersistence(game).catch(error => {
      logger.warn('Failed to persist symbol selection state', { groupChatId, error })
    })

    return { success: true, message: `Symbol ${selectedSymbol} selected` }
  }

  return { success: false, message: "No Whot card to select symbol for" }
}

export function removePlayer(groupChatId: number, userId: number): { success: boolean; gameCancelled: boolean } {
  const game = gameState.get(groupChatId)
  if (!game || (game.state !== 'waiting_for_players' && game.state !== 'ready_to_start')) {
    return { success: false, gameCancelled: false }
  }

  const playerIndex = game.players.findIndex((p: Player) => p.id === userId)
  if (playerIndex === -1) {
    return { success: false, gameCancelled: false }
  }

  // If the creator leaves, cancel the entire game
  if (game.creatorId === userId) {
    gameState.delete(groupChatId)
    logger.info('Game cancelled - creator left', { groupChatId, creatorId: userId })
    return { success: true, gameCancelled: true }
  }

  // Remove the player
  game.players.splice(playerIndex, 1)

  // Update game state based on remaining players
  if (game.players.length < 2) {
    game.state = 'waiting_for_players'
  }

  logger.info('Player left game', {
    groupChatId,
    userId,
    remainingPlayers: game.players.length,
    newState: game.state
  })

  return { success: true, gameCancelled: false }
}
