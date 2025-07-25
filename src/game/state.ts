import { GameSession, GameState, Player } from '../types/game.ts'
import { logger } from '../utils/logger.ts'
import { createDeck, dealCards, canPlayCard } from './cards.ts'

// Global game state storage (in-memory for MVP)
export const gameState = new Map<number, GameSession>()

export function createGame(groupChatId: number, creatorId: number, creatorName: string): GameSession {
  const newGame: GameSession = {
    id: groupChatId,
    state: 'waiting_for_players',
    creatorId,
    players: [],
    createdAt: new Date()
  }

  gameState.set(groupChatId, newGame)
  logger.info('Game created', { groupChatId, creatorId, creatorName })
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
  if (game.players.some(p => p.id === userId)) {
    logger.warn('Player already joined game', { groupChatId, userId })
    return false
  }

  const newPlayer: Player = {
    id: userId,
    firstName,
    state: 'joined'
  }

  game.players.push(newPlayer)
  logger.info('Player joined game', { groupChatId, userId, firstName, totalPlayers: game.players.length })

  // Game ready to start if we have 2+ players
  if (game.players.length >= 2) {
    game.state = 'ready_to_start'
    logger.info('Game ready to start', { groupChatId, totalPlayers: game.players.length })
  }

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

  gameState.delete(groupChatId)
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
  game.currentPlayerIndex = 0
  game.direction = 'clockwise'

  // Assign cards to players and set them as active
  game.players.forEach((player, index) => {
    player.hand = playerHands[index]
    player.state = 'active'
  })

  logger.info('Game started with cards', {
    groupChatId,
    totalPlayers: game.players.length,
    cardsInDeck: remainingDeck.length,
    topCard: discardPile[0]?.id,
    currentPlayer: game.players[0]?.firstName
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

// Advance to next player's turn
function advanceTurn(groupChatId: number): void {
  const game = gameState.get(groupChatId)
  if (!game || game.currentPlayerIndex === undefined) {
    return
  }

  // Simple clockwise turn advancement
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length

  logger.info('Turn advanced', {
    groupChatId,
    newCurrentPlayer: game.players[game.currentPlayerIndex]?.firstName,
    playerIndex: game.currentPlayerIndex
  })
}

// Play a card from player's hand
export function playCard(groupChatId: number, userId: number, cardId: string): { success: boolean; error?: string } {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return { success: false, error: 'Game not found or not in progress' }
  }

  const currentPlayer = getCurrentPlayer(groupChatId)
  if (!currentPlayer || currentPlayer.id !== userId) {
    return { success: false, error: 'Not your turn' }
  }

  const player = game.players.find(p => p.id === userId)
  if (!player || !player.hand) {
    return { success: false, error: 'Player not found or has no hand' }
  }

  const cardIndex = player.hand.findIndex(c => c.id === cardId)
  if (cardIndex === -1) {
    return { success: false, error: 'Card not found in hand' }
  }

  const cardToPlay = player.hand[cardIndex]
  const topCard = getTopCard(groupChatId)
  if (!topCard) {
    return { success: false, error: 'No top card found' }
  }

  // Validate the play using existing canPlayCard logic
  if (!canPlayCard(cardToPlay, topCard)) {
    return { success: false, error: 'Invalid play - card doesn\'t match top card' }
  }

  // Remove card from player's hand
  player.hand.splice(cardIndex, 1)

  // Add card to discard pile
  if (!game.discardPile) {
    game.discardPile = []
  }
  game.discardPile.push(cardToPlay)

  // Check for win condition
  if (player.hand.length === 0) {
    player.state = 'winner'
    game.state = 'ended'
    logger.info('Player won the game', { groupChatId, userId, playerName: player.firstName })
    return { success: true }
  }

  // Advance turn (basic implementation - no special cards yet)
  advanceTurn(groupChatId)

  logger.info('Card played successfully', {
    groupChatId,
    userId,
    cardId: cardToPlay.id,
    cardsRemaining: player.hand.length,
    newTopCard: cardToPlay.id
  })

  return { success: true }
}

// Draw a card from the deck
export function drawCard(groupChatId: number, userId: number): { success: boolean; error?: string; cardDrawn?: string } {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return { success: false, error: 'Game not found or not in progress' }
  }

  const currentPlayer = getCurrentPlayer(groupChatId)
  if (!currentPlayer || currentPlayer.id !== userId) {
    return { success: false, error: 'Not your turn' }
  }

  const player = game.players.find(p => p.id === userId)
  if (!player || !player.hand) {
    return { success: false, error: 'Player not found or has no hand' }
  }

  if (!game.deck || game.deck.length === 0) {
    return { success: false, error: 'No cards left in deck' }
  }

  // Draw the top card from deck
  const drawnCard = game.deck.pop()!
  player.hand.push(drawnCard)

  // Advance turn after drawing
  advanceTurn(groupChatId)

  logger.info('Card drawn successfully', {
    groupChatId,
    userId,
    cardDrawn: drawnCard.id,
    cardsInHand: player.hand.length,
    cardsInDeck: game.deck.length
  })

  return { success: true, cardDrawn: drawnCard.id }
}
