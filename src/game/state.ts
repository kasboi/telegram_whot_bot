import { GameSession, GameState, Player } from '../types/game.ts'
import { logger } from '../utils/logger.ts'

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
