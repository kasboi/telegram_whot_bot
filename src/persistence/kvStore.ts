/// <reference lib="deno.unstable" />

import { GameSession } from '../types/game.ts'
import { GameStore, PersistenceResult } from './types.ts'
import { logger } from '../utils/logger.ts'

/**
 * Deno KV-based game storage implementation
 * 
 * Key patterns:
 * - ["games", groupChatId] → GameSession
 * - ["active_games", groupChatId] → boolean
 * - ["player_games", userId, groupChatId] → boolean
 */
export class KVGameStore implements GameStore {
  private kv: Deno.Kv | null = null
  private initialized = false

  constructor() {
    // Initialize in async init() method
  }

  async init(): Promise<void> {
    if (this.initialized) return

    try {
      this.kv = await Deno.openKv()
      this.initialized = true
      logger.info('KV store initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize KV store', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.kv) {
      throw new Error('KV store not initialized. Call init() first.')
    }
  }

  async saveGame(game: GameSession): Promise<void> {
    this.ensureInitialized()

    try {
      const isActive = game.state !== 'ended'

      // Atomic operation to maintain consistency
      const result = await this.kv!.atomic()
        .set(["games", game.id], game)
        .set(["active_games", game.id], isActive)
        .commit()

      if (!result.ok) {
        throw new Error('Failed to save game - atomic operation failed')
      }

      // Update player indexes for active games
      if (isActive) {
        for (const player of game.players) {
          await this.kv!.set(["player_games", player.id, game.id], true)
        }
      }

      logger.debug('Game saved to KV store', {
        groupChatId: game.id,
        state: game.state,
        playerCount: game.players.length
      })
    } catch (error) {
      logger.error('Failed to save game to KV store', {
        groupChatId: game.id,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  async loadGame(groupChatId: number): Promise<GameSession | null> {
    this.ensureInitialized()

    try {
      const result = await this.kv!.get(["games", groupChatId])

      if (result.value === null) {
        return null
      }

      const game = result.value as GameSession

      logger.debug('Game loaded from KV store', {
        groupChatId,
        state: game.state,
        playerCount: game.players.length
      })

      return game
    } catch (error) {
      logger.error('Failed to load game from KV store', {
        groupChatId,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  async deleteGame(groupChatId: number): Promise<void> {
    this.ensureInitialized()

    try {
      // First get the game to clean up player indexes
      const game = await this.loadGame(groupChatId)

      // Start atomic deletion
      const atomic = this.kv!.atomic()
        .delete(["games", groupChatId])
        .delete(["active_games", groupChatId])

      // Clean up player indexes if game exists
      if (game) {
        for (const player of game.players) {
          atomic.delete(["player_games", player.id, groupChatId])
        }
      }

      const result = await atomic.commit()

      if (!result.ok) {
        throw new Error('Failed to delete game - atomic operation failed')
      }

      logger.info('Game deleted from KV store', { groupChatId })
    } catch (error) {
      logger.error('Failed to delete game from KV store', {
        groupChatId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  async listActiveGames(): Promise<number[]> {
    this.ensureInitialized()

    try {
      const activeGames: number[] = []

      for await (const entry of this.kv!.list({ prefix: ["active_games"] })) {
        if (entry.value === true) {
          activeGames.push(entry.key[1] as number)
        }
      }

      logger.debug('Listed active games from KV store', { count: activeGames.length })
      return activeGames
    } catch (error) {
      logger.error('Failed to list active games from KV store', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  async getPlayerGames(userId: number): Promise<GameSession[]> {
    this.ensureInitialized()

    try {
      const games: GameSession[] = []

      for await (const entry of this.kv!.list({ prefix: ["player_games", userId] })) {
        if (entry.value === true) {
          const groupChatId = entry.key[2] as number
          const game = await this.loadGame(groupChatId)
          if (game) {
            games.push(game)
          }
        }
      }

      logger.debug('Retrieved player games from KV store', { userId, count: games.length })
      return games
    } catch (error) {
      logger.error('Failed to get player games from KV store', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  async close(): Promise<void> {
    if (this.kv) {
      await Promise.resolve() // Make it properly async
      this.kv.close()
      this.kv = null
      this.initialized = false
      logger.info('KV store closed')
    }
  }

  /**
   * Health check for KV store
   */
  async healthCheck(): Promise<PersistenceResult> {
    this.ensureInitialized()

    try {
      // Test basic KV operations
      const testKey = ["health_check", Date.now()]
      const testValue = { test: true, timestamp: new Date() }

      await this.kv!.set(testKey, testValue)
      const result = await this.kv!.get(testKey)
      await this.kv!.delete(testKey)

      if (result.value === null) {
        return { success: false, error: 'KV read operation failed' }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
