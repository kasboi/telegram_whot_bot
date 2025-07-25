import { GameSession, GameState, Player } from '../types/game.ts'
import { logger } from '../utils/logger.ts'
import { createDeck, dealCards } from './cards.ts'

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
