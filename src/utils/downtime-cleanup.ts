import { logger } from './logger.ts'
import { getPersistenceManager, getMemoryStore } from '../game/state.ts'

/**
 * Tracks bot startup time and handles cleanup after extended downtime
 */

const DOWNTIME_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2 hours in milliseconds (was 10 minutes)
const STALE_GAME_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours for stale games
const LAST_SHUTDOWN_KEY = 'bot_last_shutdown'

/**
 * Records the current timestamp as the last shutdown time in KV storage
 */
export async function recordShutdownTime(): Promise<void> {
  try {
    const persistenceManager = getPersistenceManager()
    if (!persistenceManager) {
      logger.warn('Cannot record shutdown time - no persistence manager available')
      return
    }

    // We'll use KV storage directly to store shutdown time
    const kv = await Deno.openKv()
    await kv.set([LAST_SHUTDOWN_KEY], Date.now())
    await kv.close()

    logger.info('Bot shutdown time recorded', { timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error('Failed to record shutdown time', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Checks if bot has been down for more than the threshold and performs cleanup if needed
 */
export async function checkDowntimeAndCleanup(): Promise<{ wasLongDowntime: boolean; cleanedGames: number }> {
  let wasLongDowntime = false
  let cleanedGames = 0

  try {
    const kv = await Deno.openKv()
    const lastShutdownResult = await kv.get([LAST_SHUTDOWN_KEY])
    await kv.close()

    const currentTime = Date.now()
    let downtimeMs = 0

    if (lastShutdownResult.value !== null) {
      const lastShutdownTime = lastShutdownResult.value as number
      downtimeMs = currentTime - lastShutdownTime

      logger.info('Bot downtime calculated', {
        lastShutdown: new Date(lastShutdownTime).toISOString(),
        currentTime: new Date(currentTime).toISOString(),
        downtimeMs,
        downtimeMinutes: Math.round(downtimeMs / (60 * 1000))
      })

      if (downtimeMs > DOWNTIME_THRESHOLD_MS) {
        wasLongDowntime = true
        logger.warn('Extended downtime detected - performing complete cleanup', {
          downtimeMinutes: Math.round(downtimeMs / (60 * 1000)),
          thresholdMinutes: DOWNTIME_THRESHOLD_MS / (60 * 1000)
        })

        cleanedGames = await performCompleteCleanup()
      }
    } else {
      logger.info('No previous shutdown time found - assuming fresh start')
    }

    // Record new startup time for next restart
    await recordCurrentStartupTime()

    return { wasLongDowntime, cleanedGames }
  } catch (error) {
    logger.error('Failed to check downtime and cleanup', {
      error: error instanceof Error ? error.message : String(error)
    })
    return { wasLongDowntime: false, cleanedGames: 0 }
  }
}

/**
 * Records the current time as startup time (for next shutdown comparison)
 */
async function recordCurrentStartupTime(): Promise<void> {
  try {
    const kv = await Deno.openKv()
    await kv.set([LAST_SHUTDOWN_KEY], Date.now())
    await kv.close()

    logger.debug('Current startup time recorded for next downtime check')
  } catch (error) {
    logger.warn('Failed to record startup time', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Performs complete cleanup of all game sessions from memory and persistent storage
 */
async function performCompleteCleanup(): Promise<number> {
  let totalCleaned = 0

  try {
    // Get current games before cleanup
    const memoryStore = getMemoryStore()
    const gameIds = Array.from(memoryStore.keys())

    if (gameIds.length === 0) {
      logger.info('No games found to clean up')
      return 0
    }

    logger.info('Starting complete game session cleanup', {
      totalGames: gameIds.length,
      gameIds
    })

    // Clear all games from memory
    memoryStore.clear()
    totalCleaned += gameIds.length

    // Clear all games from persistent storage
    const persistenceManager = getPersistenceManager()
    if (persistenceManager) {
      for (const gameId of gameIds) {
        try {
          await persistenceManager.deleteGame(gameId)
          logger.debug('Cleaned game from persistence', { gameId })
        } catch (error) {
          logger.warn('Failed to clean game from persistence', {
            gameId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      // Also clear any orphaned KV entries
      await clearOrphanedKVEntries()
    }

    logger.info('Complete cleanup finished', {
      cleanedGames: totalCleaned,
      memoryGamesRemaining: memoryStore.size
    })

  } catch (error) {
    logger.error('Error during complete cleanup', {
      error: error instanceof Error ? error.message : String(error)
    })
  }

  return totalCleaned
}

/**
 * Clears any orphaned KV entries that might exist
 */
async function clearOrphanedKVEntries(): Promise<void> {
  try {
    const kv = await Deno.openKv()

    // Clear all game-related entries
    const gameEntries = kv.list({ prefix: ['games'] })
    const activeGameEntries = kv.list({ prefix: ['active_games'] })
    const playerGameEntries = kv.list({ prefix: ['player_games'] })

    let deletedCount = 0

    // Delete game entries
    for await (const entry of gameEntries) {
      await kv.delete(entry.key)
      deletedCount++
    }

    // Delete active game entries
    for await (const entry of activeGameEntries) {
      await kv.delete(entry.key)
      deletedCount++
    }

    // Delete player game entries
    for await (const entry of playerGameEntries) {
      await kv.delete(entry.key)
      deletedCount++
    }

    await kv.close()

    if (deletedCount > 0) {
      logger.info('Cleared orphaned KV entries', { deletedCount })
    }
  } catch (error) {
    logger.warn('Failed to clear orphaned KV entries', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Performs smart cleanup of stale games based on age and activity
 */
export async function cleanupStaleGames(): Promise<{ cleaned: number; details: Array<{ id: number; reason: string; age: number }> }> {
  const memoryStore = getMemoryStore()
  const now = Date.now()
  const cleaned: Array<{ id: number; reason: string; age: number }> = []

  try {
    for (const [gameId, game] of memoryStore.entries()) {
      const gameAge = now - game.createdAt.getTime()
      let shouldClean = false
      let reason = ''

      // Clean games older than 24 hours that aren't actively being played
      if (gameAge > STALE_GAME_THRESHOLD_MS) {
        if (game.state === 'waiting_for_players' || game.state === 'ready_to_start') {
          shouldClean = true
          reason = 'Stale lobby (24+ hours old)'
        } else if (game.state === 'in_progress') {
          // For in-progress games, check if there's been recent activity
          const lastActivity = game.lastActionTime || game.createdAt
          const timeSinceActivity = now - lastActivity.getTime()

          if (timeSinceActivity > (6 * 60 * 60 * 1000)) { // 6 hours of inactivity
            shouldClean = true
            reason = 'Inactive game (6+ hours no activity)'
          }
        } else if (game.state === 'ended') {
          // Clean up ended games after 1 hour
          if (gameAge > (60 * 60 * 1000)) {
            shouldClean = true
            reason = 'Ended game cleanup'
          }
        }
      }

      if (shouldClean) {
        // Clear from memory
        memoryStore.delete(gameId)

        // Clear from persistence
        const persistenceManager = getPersistenceManager()
        if (persistenceManager) {
          try {
            await persistenceManager.deleteGame(gameId)
          } catch (error) {
            logger.warn('Failed to delete stale game from persistence', {
              gameId,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }

        cleaned.push({ id: gameId, reason, age: Math.round(gameAge / (60 * 1000)) })

        logger.info('Cleaned stale game', {
          gameId,
          reason,
          ageMinutes: Math.round(gameAge / (60 * 1000)),
          state: game.state,
          playerCount: game.players.length
        })
      }
    }

    if (cleaned.length > 0) {
      logger.info('Stale game cleanup completed', {
        cleanedCount: cleaned.length,
        remainingGames: memoryStore.size,
        details: cleaned
      })
    }

    return { cleaned: cleaned.length, details: cleaned }
  } catch (error) {
    logger.error('Error during stale game cleanup', {
      error: error instanceof Error ? error.message : String(error)
    })
    return { cleaned: 0, details: [] }
  }
}

/**
 * Starts a periodic cleanup interval that runs every hour
 */
export function startPeriodicCleanup(): void {
  // Run cleanup every hour
  setInterval(async () => {
    try {
      const result = await cleanupStaleGames()
      if (result.cleaned > 0) {
        logger.info('Periodic cleanup completed', {
          cleanedGames: result.cleaned,
          details: result.details.map(d => `${d.id}: ${d.reason} (${d.age}min old)`)
        })
      }
    } catch (error) {
      logger.error('Periodic cleanup failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }, 60 * 60 * 1000) // Run every hour

  logger.info('Periodic stale game cleanup started (runs every hour)')
}
