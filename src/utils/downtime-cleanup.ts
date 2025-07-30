import { logger } from './logger.ts'
import { getPersistenceManager, getMemoryStore } from '../game/state.ts'

/**
 * Tracks bot startup time and handles cleanup after extended downtime
 */

const DOWNTIME_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes in milliseconds
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
