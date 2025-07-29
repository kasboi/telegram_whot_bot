import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { gameState, getPersistenceManager, clearGame } from '../game/state.ts'
import { logger } from '../utils/logger.ts'

/**
 * Admin commands for game management and persistence monitoring
 */

// List of admin user IDs (replace with actual admin IDs)
const ADMIN_IDS: number[] = [
  // Add admin user IDs here when needed
  // Example: 123456789, 
]

function isAdmin(userId: number): boolean {
  // For development/testing: allow group creators to use admin commands
  // TODO: Remove this in production and use ADMIN_IDS only
  return ADMIN_IDS.includes(userId) || true // Temporarily allow all users for debugging
}

export function handleAdminCommands(bot: Bot) {

  // Command to show persistence status
  bot.command('persiststatus', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    try {
      const memoryGames = gameState.size
      const gameIds = Array.from(gameState.keys())
      const persistenceManager = getPersistenceManager()

      let status = `🔧 **Persistence Status**\n\n` +
        `📊 **Memory Store:**\n` +
        `• Active games: ${memoryGames}\n` +
        `• Game IDs: ${gameIds.length > 0 ? gameIds.join(', ') : 'None'}\n\n`

      if (persistenceManager) {
        const health = await persistenceManager.healthCheck()
        status += `💾 **KV Store:** ${health.kv ? '✅' : '❌'} ${health.kv ? 'Active' : 'Failed'}\n` +
          `🔄 **Mode:** ${health.mode}\n` +
          `🏥 **Health:** ${health.kv && health.memory ? 'All systems operational' : 'Degraded service'}`
      } else {
        status += `💾 **KV Store:** ❌ Not initialized\n` +
          `🔄 **Mode:** memory-only\n` +
          `🏥 **Health:** Memory-only mode`
      }

      await ctx.reply(status, { parse_mode: 'Markdown' })

      logger.info('Admin checked persistence status', {
        userId: ctx.from?.id,
        memoryGames,
        gameIds,
        hasPersistence: !!persistenceManager
      })
    } catch (error) {
      await ctx.reply(`❌ Error checking status: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin status check failed', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  // Command to show active games
  bot.command('listgames', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    try {
      if (gameState.size === 0) {
        await ctx.reply('📭 No active games')
        return
      }

      let gamesList = '🎮 **Active Games:**\n\n'

      for (const [groupChatId, game] of gameState.entries()) {
        gamesList += `**Group ${groupChatId}:**\n`
        gamesList += `• State: ${game.state}\n`
        gamesList += `• Players: ${game.players.length}\n`
        gamesList += `• Created: ${game.createdAt.toLocaleString()}\n\n`
      }

      await ctx.reply(gamesList, { parse_mode: 'Markdown' })

      logger.info('Admin listed games', {
        userId: ctx.from?.id,
        gameCount: gameState.size
      })
    } catch (error) {
      await ctx.reply(`❌ Error listing games: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin list games failed', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  // Command to force start a specific game (for debugging)
  bot.command('forcestart', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    try {
      const args = ctx.message?.text?.split(' ')
      if (!args || args.length < 2) {
        await ctx.reply('💡 Usage: `/forcestart <groupChatId>`\n\nUse /listgames to see available games.')
        return
      }

      const groupChatId = parseInt(args[1])
      if (isNaN(groupChatId)) {
        await ctx.reply('❌ Invalid group chat ID')
        return
      }

      const game = gameState.get(groupChatId)
      if (!game) {
        await ctx.reply('❌ Game not found')
        return
      }

      if (game.state === 'in_progress') {
        await ctx.reply('✅ Game is already in progress')
        return
      }

      // Import the start function
      const { startGameWithCards } = await import('../game/state.ts')
      const success = startGameWithCards(groupChatId)
      
      if (success) {
        await ctx.reply(`✅ Force started game ${groupChatId}\n\nState: ${game.state} → in_progress`)
      } else {
        await ctx.reply(`❌ Failed to force start game ${groupChatId}`)
      }

      logger.info('Admin force started game', {
        userId: ctx.from?.id,
        groupChatId,
        oldState: 'ready_to_start',
        newState: game.state,
        playerCount: game.players.length
      })

    } catch (error) {
      await ctx.reply(`❌ Force start failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin force start failed', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  // Command to force clean a specific game
  bot.command('forceclean', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    try {
      const args = ctx.message?.text?.split(' ')
      if (!args || args.length < 2) {
        // Show current games to clean
        if (gameState.size === 0) {
          await ctx.reply('📭 No games to clean')
          return
        }

        let gamesList = '🗑️ **Games Available for Cleanup:**\n\n'
        for (const [groupChatId, game] of gameState.entries()) {
          gamesList += `**${groupChatId}**: ${game.state} (${game.players.length} players)\n`
        }
        gamesList += '\n💡 Usage: `/forceclean <groupChatId>`'

        await ctx.reply(gamesList, { parse_mode: 'Markdown' })
        return
      }

      const groupChatId = parseInt(args[1])
      if (isNaN(groupChatId)) {
        await ctx.reply('❌ Invalid group chat ID')
        return
      }

      const game = gameState.get(groupChatId)
      if (!game) {
        await ctx.reply('❌ Game not found')
        return
      }

      const gameInfo = `${game.state} (${game.players.length} players)`
      clearGame(groupChatId)
      
      await ctx.reply(`✅ Forcefully cleaned game ${groupChatId}: ${gameInfo}`)

      logger.info('Admin force cleaned game', {
        userId: ctx.from?.id,
        groupChatId,
        gameState: game.state,
        playerCount: game.players.length
      })

    } catch (error) {
      await ctx.reply(`❌ Force clean failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin force clean failed', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  // Command to clean up stale games
  bot.command('cleangames', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    try {
      let cleaned = 0
      const staleCutoff = Date.now() - (24 * 60 * 60 * 1000) // 24 hours ago

      for (const [groupChatId, game] of gameState.entries()) {
        // Clean up games that are stale (old and not in progress)
        const isStale = game.createdAt.getTime() < staleCutoff
        const isNotActive = game.state === 'waiting_for_players' || game.state === 'ready_to_start'
        
        if (isStale && isNotActive) {
          clearGame(groupChatId)
          cleaned++
          logger.info('Admin cleaned stale game', { groupChatId, state: game.state, age: Date.now() - game.createdAt.getTime() })
        }
      }

      const message = cleaned > 0 
        ? `✅ Cleaned up ${cleaned} stale game(s)`
        : `📭 No stale games found to clean`

      await ctx.reply(message)

      logger.info('Admin cleaned stale games', {
        userId: ctx.from?.id,
        cleaned,
        remaining: gameState.size
      })
    } catch (error) {
      await ctx.reply(`❌ Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin game cleanup failed', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  // Command to manually recover games from KV storage
  bot.command('recovergames', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    try {
      const persistenceManager = getPersistenceManager()
      if (!persistenceManager) {
        await ctx.reply('❌ Persistence manager not available')
        return
      }

      await ctx.reply('🔄 Starting game recovery from KV storage...')

      const result = await persistenceManager.recoverGamesFromKV()

      const message = `✅ **Game Recovery Complete**\n\n` +
        `📥 **Recovered:** ${result.recovered} games\n` +
        `❌ **Failed:** ${result.failed} games\n` +
        `📊 **Total in Memory:** ${gameState.size} games`

      await ctx.reply(message, { parse_mode: 'Markdown' })

      logger.info('Admin triggered game recovery', {
        userId: ctx.from?.id,
        recovered: result.recovered,
        failed: result.failed,
        totalInMemory: gameState.size
      })
    } catch (error) {
      await ctx.reply(`❌ Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin game recovery failed', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })
}
