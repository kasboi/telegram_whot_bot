import { GameSession } from '../types/game.ts'
import { KVGameStore } from './kvStore.ts'
import { logger } from '../utils/logger.ts'

/**
 * Persistence manager that handles the migration strategy
 * Phase 1: KV-only mode
 * Phase 2: Dual-write mode (KV + memory)
 * Phase 3: KV-primary with memory fallback
 * Phase 4: KV-only mode
 */
export class PersistenceManager {
  private kvStore: KVGameStore
  private memoryStore: Map<number, GameSession> | null = null
  private mode: 'kv-only' | 'dual-write' | 'kv-primary' | 'memory-fallback' = 'kv-only'
  private initialized = false

  constructor(memoryStore?: Map<number, GameSession>) {
    this.kvStore = new KVGameStore()
    this.memoryStore = memoryStore || null

    // Set initial mode based on whether memory store is provided
    if (memoryStore) {
      this.mode = 'dual-write'
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return

    try {
      await this.kvStore.init()

      // Health check
      const health = await this.kvStore.healthCheck()
      if (!health.success) {
        logger.warn('KV store health check failed, falling back to memory-only', { error: health.error })
        this.mode = 'memory-fallback'
      }

      this.initialized = true
      logger.info('Persistence manager initialized', { mode: this.mode })
    } catch (error) {
      logger.error('Failed to initialize persistence manager', { error: error instanceof Error ? error.message : String(error) })
      this.mode = 'memory-fallback'
      this.initialized = true
    }
  }

  async saveGame(game: GameSession): Promise<void> {
    if (!this.initialized) {
      throw new Error('Persistence manager not initialized')
    }

    switch (this.mode) {
      case 'kv-only':
        await this.kvStore.saveGame(game)
        break

      case 'dual-write':
        // Write to both KV and memory
        try {
          await this.kvStore.saveGame(game)
          if (this.memoryStore) {
            this.memoryStore.set(game.id, game)
          }
        } catch (error) {
          logger.error('KV save failed in dual-write mode', { groupChatId: game.id, error })
          // Still save to memory
          if (this.memoryStore) {
            this.memoryStore.set(game.id, game)
          }
        }
        break

      case 'kv-primary':
        try {
          await this.kvStore.saveGame(game)
        } catch (error) {
          logger.warn('KV save failed, falling back to memory', { groupChatId: game.id, error })
          if (this.memoryStore) {
            this.memoryStore.set(game.id, game)
          }
        }
        break

      case 'memory-fallback':
        if (this.memoryStore) {
          this.memoryStore.set(game.id, game)
        } else {
          throw new Error('No storage available')
        }
        break
    }
  }

  async loadGame(groupChatId: number): Promise<GameSession | null> {
    if (!this.initialized) {
      throw new Error('Persistence manager not initialized')
    }

    switch (this.mode) {
      case 'kv-only':
        return await this.kvStore.loadGame(groupChatId)

      case 'dual-write':
      case 'kv-primary':
        try {
          const game = await this.kvStore.loadGame(groupChatId)
          if (game) return game

          // Fallback to memory if KV doesn't have it
          return this.memoryStore?.get(groupChatId) || null
        } catch (error) {
          logger.warn('KV load failed, falling back to memory', { groupChatId, error })
          return this.memoryStore?.get(groupChatId) || null
        }

      case 'memory-fallback':
        return this.memoryStore?.get(groupChatId) || null

      default:
        return null
    }
  }

  async deleteGame(groupChatId: number): Promise<void> {
    if (!this.initialized) {
      throw new Error('Persistence manager not initialized')
    }

    switch (this.mode) {
      case 'kv-only':
        await this.kvStore.deleteGame(groupChatId)
        break

      case 'dual-write':
        try {
          await this.kvStore.deleteGame(groupChatId)
        } catch (error) {
          logger.error('KV delete failed in dual-write mode', { groupChatId, error })
        }
        this.memoryStore?.delete(groupChatId)
        break

      case 'kv-primary':
        try {
          await this.kvStore.deleteGame(groupChatId)
        } catch (error) {
          logger.warn('KV delete failed, deleting from memory only', { groupChatId, error })
        }
        this.memoryStore?.delete(groupChatId)
        break

      case 'memory-fallback':
        this.memoryStore?.delete(groupChatId)
        break
    }
  }

  async listActiveGames(): Promise<number[]> {
    if (!this.initialized) {
      throw new Error('Persistence manager not initialized')
    }

    switch (this.mode) {
      case 'kv-only':
        return await this.kvStore.listActiveGames()

      case 'dual-write':
      case 'kv-primary':
        try {
          return await this.kvStore.listActiveGames()
        } catch (error) {
          logger.warn('KV list failed, falling back to memory', { error })
          return this.memoryStore ? Array.from(this.memoryStore.keys()) : []
        }

      case 'memory-fallback':
        return this.memoryStore ? Array.from(this.memoryStore.keys()) : []

      default:
        return []
    }
  }

  async getPlayerGames(userId: number): Promise<GameSession[]> {
    if (!this.initialized) {
      throw new Error('Persistence manager not initialized')
    }

    switch (this.mode) {
      case 'kv-only':
        return await this.kvStore.getPlayerGames(userId)

      case 'dual-write':
      case 'kv-primary':
        try {
          return await this.kvStore.getPlayerGames(userId)
        } catch (error) {
          logger.warn('KV player games query failed, falling back to memory scan', { userId, error })
          if (this.memoryStore) {
            return Array.from(this.memoryStore.values()).filter(game =>
              game.players.some(player => player.id === userId)
            )
          }
          return []
        }

      case 'memory-fallback':
        if (this.memoryStore) {
          return Array.from(this.memoryStore.values()).filter(game =>
            game.players.some(player => player.id === userId)
          )
        }
        return []

      default:
        return []
    }
  }

  async close(): Promise<void> {
    await this.kvStore.close()
    this.initialized = false
  }

  // Migration methods
  setMode(mode: 'kv-only' | 'dual-write' | 'kv-primary' | 'memory-fallback'): void {
    const oldMode = this.mode
    this.mode = mode
    logger.info('Persistence mode changed', { from: oldMode, to: mode })
  }

  getMode(): string {
    return this.mode
  }

  /**
   * Migrate all games from memory to KV
   */
  async migrateMemoryToKV(): Promise<{ success: number; failed: number }> {
    if (!this.memoryStore) {
      return { success: 0, failed: 0 }
    }

    let success = 0
    let failed = 0

    for (const [groupChatId, game] of this.memoryStore.entries()) {
      try {
        await this.kvStore.saveGame(game)
        success++
        logger.debug('Migrated game to KV', { groupChatId })
      } catch (error) {
        failed++
        logger.error('Failed to migrate game to KV', {
          groupChatId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    logger.info('Memory to KV migration completed', { success, failed })
    return { success, failed }
  }

  /**
   * Recover all active games from KV storage back into memory
   * This is called during bot startup to restore game state
   */
  async recoverGamesFromKV(): Promise<{ recovered: number; failed: number }> {
    if (!this.memoryStore) {
      logger.warn('No memory store available for game recovery')
      return { recovered: 0, failed: 0 }
    }

    let recovered = 0
    let failed = 0

    try {
      // Get list of all active games from KV
      const activeGameIds = await this.kvStore.listActiveGames()
      logger.info('Starting game recovery from KV storage', {
        totalGames: activeGameIds.length,
        mode: this.mode
      })

      // Load each game and restore to memory
      for (const groupChatId of activeGameIds) {
        try {
          const game = await this.kvStore.loadGame(groupChatId)
          if (game) {
            this.memoryStore.set(groupChatId, game)
            recovered++
            logger.debug('Recovered game from KV', {
              groupChatId,
              state: game.state,
              players: game.players.length
            })
          }
        } catch (error) {
          failed++
          logger.error('Failed to recover game from KV', {
            groupChatId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      logger.info('Game recovery completed', { recovered, failed })
    } catch (error) {
      logger.error('Failed to list active games during recovery', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { recovered: 0, failed: 1 }
    }

    return { recovered, failed }
  }

  /**
   * Health check for the persistence layer
   */
  async healthCheck(): Promise<{ kv: boolean; memory: boolean; mode: string }> {
    let kvHealth = false
    let memoryHealth = false

    try {
      const kvResult = await this.kvStore.healthCheck()
      kvHealth = kvResult.success
    } catch (error) {
      logger.error('KV health check failed', { error })
    }

    memoryHealth = this.memoryStore !== null

    return {
      kv: kvHealth,
      memory: memoryHealth,
      mode: this.mode
    }
  }
}
