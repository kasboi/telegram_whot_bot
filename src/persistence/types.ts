/**
 * Persistence layer types for game state storage
 */

export interface GameStore {
  saveGame(game: import('../types/game.ts').GameSession): Promise<void>
  loadGame(groupChatId: number): Promise<import('../types/game.ts').GameSession | null>
  deleteGame(groupChatId: number): Promise<void>
  listActiveGames(): Promise<number[]>
  getPlayerGames(userId: number): Promise<import('../types/game.ts').GameSession[]>
  close(): Promise<void>
}

export interface PersistenceResult {
  success: boolean
  error?: string
}
