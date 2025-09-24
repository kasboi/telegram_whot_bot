import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { gameState, getPersistenceManager, clearGame } from '../game/state.ts'
import { logger } from '../utils/logger.ts'
import { CommandContext, Context } from "https://deno.land/x/grammy@v1.37.0/context.ts"

/**
 * Admin commands for game management and persistence monitoring
 */

// List of admin users (replace with actual admin user IDs)
const ADMIN_USERS = [
  // Add your admin user IDs here
  // Example: 123456789
]

const adminHelpMessage = `🔧 **Admin Commands:**

**Game Management (Group Chats Only):**
• \`/killgame\` - Terminate the ongoing game in current group with player notifications
• \`/forcestart\` - Force start a ready game in current group
• \`/cleangames\` - Clean up stale games (24+ hours old)

**Monitoring (Any Chat):**
• \`/persiststatus\` - Show persistence and memory status
• \`/listgames\` - List all active games
• \`/recovergames\` - Manually recover games from KV storage

**Help:**
• \`/adminhelp\` - Show this admin help message

🔒 **Security Note:** Game management commands only work on the current group for security.`

const ADMIN_IDS: number[] = [
  // Add admin user IDs here when needed
  // Example: 123456789, 
]

function isAdmin(userId: number): boolean {
  // For development/testing: allow group creators to use admin commands
  // TODO: Remove this in production and use ADMIN_IDS only
  return ADMIN_IDS.includes(userId) // || true // Temporarily allow all users for debugging
}

async function updateAdminList(ctx: CommandContext<Context>) {
  const adminUsers = await ctx.getChatAdministrators()

  adminUsers.forEach(admin => {
    if (!ADMIN_IDS.includes(admin.user.id)) {
      ADMIN_IDS.push(admin.user.id)
    }
  })
}


export function handleAdminCommands(bot: Bot) {

  // Command to show persistence status
  bot.command('persiststatus', async (ctx) => {
    await updateAdminList(ctx)

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
    await updateAdminList(ctx)

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
    await updateAdminList(ctx)
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    // Only work in group chats
    if (ctx.chat.type === 'private') {
      await ctx.reply('❌ This command can only be used in group chats')
      return
    }

    try {
      const groupChatId = ctx.chat.id

      const game = gameState.get(groupChatId)
      if (!game) {
        await ctx.reply('❌ No game found in this group')
        return
      }

      if (game.state === 'in_progress') {
        await ctx.reply('✅ Game is already in progress')
        return
      }

      if (game.state !== 'ready_to_start') {
        await ctx.reply(`❌ Game is not ready to start (current state: ${game.state})`)
        return
      }

      // Import the start function
      const { startGameWithCards } = await import('../game/state.ts')
      const success = startGameWithCards(groupChatId)

      if (success) {
        await ctx.reply(`✅ Force started game in this group\n\nState: ready_to_start → in_progress`)
      } else {
        await ctx.reply(`❌ Failed to force start game`)
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

  // Command to show detailed game analysis for debugging
  bot.command('gameanalysis', async (ctx) => {
    await updateAdminList(ctx)
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    try {
      if (gameState.size === 0) {
        await ctx.reply('📭 No games to analyze')
        return
      }

      let analysis = '🔍 **Game Analysis (ALL GROUPS - ADMIN VIEW):**\n\n'
      analysis += `⚠️ **SECURITY WARNING**: This shows games from ALL groups!\n\n`

      for (const [groupChatId, game] of gameState.entries()) {
        const ageMinutes = Math.floor((Date.now() - game.createdAt.getTime()) / (60 * 1000))
        const ageHours = Math.floor(ageMinutes / 60)
        const lastActionAge = game.lastActionTime
          ? Math.floor((Date.now() - game.lastActionTime.getTime()) / (60 * 1000))
          : 'N/A'

        analysis += `**Group ${groupChatId}:**\n`
        analysis += `• State: ${game.state}\n`
        analysis += `• Players: ${game.players.length}\n`
        analysis += `• Age: ${ageHours}h ${ageMinutes % 60}m\n`
        analysis += `• Last action: ${lastActionAge === 'N/A' ? 'N/A' : `${lastActionAge}min ago`}\n`
        analysis += `• Should clean?: ${ageMinutes > (24 * 60) ? '🚨 YES' : '✅ NO'}\n\n`
      }

      await ctx.reply(analysis, { parse_mode: 'Markdown' })

      logger.warn('Admin performed cross-group game analysis', {
        userId: ctx.from?.id,
        gameCount: gameState.size,
        groupIds: Array.from(gameState.keys())
      })
    } catch (error) {
      await ctx.reply(`❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  })

  // Command to clean up stale games (DANGEROUS - affects ALL groups)
  bot.command('cleangames', async (ctx) => {
    await updateAdminList(ctx)
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    try {
      await ctx.reply('⚠️ **SECURITY WARNING**: This command affects ALL groups!\n\nUse /cleangroup for safe, group-specific cleanup.')

      // Use the new smart cleanup function
      const { cleanupStaleGames } = await import('../utils/downtime-cleanup.ts')
      const result = await cleanupStaleGames()

      if (result.cleaned === 0) {
        await ctx.reply('📭 No stale games found to clean')
        return
      }

      let message = `✅ **Cleaned up ${result.cleaned} stale game(s) ACROSS ALL GROUPS:**\n\n`

      result.details.forEach(detail => {
        message += `• Group ${detail.id}: ${detail.reason} (${detail.age} min old)\n`
      })

      message += `\n📊 Remaining games: ${gameState.size}`

      await ctx.reply(message, { parse_mode: 'Markdown' })

      logger.warn('Admin triggered CROSS-GROUP stale cleanup', {
        userId: ctx.from?.id,
        cleaned: result.cleaned,
        details: result.details,
        remaining: gameState.size,
        warning: 'CROSS_GROUP_CLEANUP_PERFORMED'
      })
    } catch (error) {
      await ctx.reply(`❌ Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin game cleanup failed', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  // NEW: Safe group-specific cleanup command
  bot.command('cleangroup', async (ctx) => {
    await updateAdminList(ctx)
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    // Only works in group chats
    if (ctx.chat.type === 'private') {
      await ctx.reply('❌ This command only works in group chats')
      return
    }

    const groupChatId = ctx.chat.id

    try {
      const game = gameState.get(groupChatId)

      if (!game) {
        await ctx.reply('📭 No game found for this group')
        return
      }

      const ageMinutes = Math.floor((Date.now() - game.createdAt.getTime()) / (60 * 1000))
      const ageHours = Math.floor(ageMinutes / 60)

      // Remove the game
      gameState.delete(groupChatId)

      // Also remove from persistence
      const persistenceManager = getPersistenceManager()
      if (persistenceManager) {
        try {
          await persistenceManager.deleteGame(groupChatId)
        } catch (error) {
          logger.warn('Failed to delete game from persistence', { groupChatId, error })
        }
      }

      await ctx.reply(`✅ **Cleaned this group's game:**\n\n• State: ${game.state}\n• Players: ${game.players.length}\n• Age: ${ageHours}h ${ageMinutes % 60}m\n\n📊 Safe group-specific cleanup completed`, { parse_mode: 'Markdown' })

      logger.info('Admin performed safe group-specific cleanup', {
        userId: ctx.from?.id,
        groupChatId,
        gameAge: ageMinutes,
        gameState: game.state,
        playerCount: game.players.length
      })
    } catch (error) {
      await ctx.reply(`❌ Group cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin group cleanup failed', {
        userId: ctx.from?.id,
        groupChatId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  // Command to manually recover games from KV storage
  bot.command('recovergames', async (ctx) => {
    await updateAdminList(ctx)
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

  // Command to kill an ongoing game
  bot.command('killgame', async (ctx) => {
    await updateAdminList(ctx)
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    // Only work in group chats
    if (ctx.chat.type === 'private') {
      await ctx.reply('❌ This command can only be used in group chats')
      return
    }

    try {
      const groupChatId = ctx.chat.id

      const game = gameState.get(groupChatId)
      if (!game) {
        await ctx.reply('❌ No game found in this group')
        return
      }

      if (game.state === 'ended') {
        await ctx.reply('❌ Game is already ended')
        return
      }

      // Notify players in the group chat that the game was terminated
      try {
        const adminName = ctx.from.first_name || 'Admin'
        const terminationMessage = `🚨 **GAME TERMINATED BY ADMIN** 🚨\n\n` +
          `The game has been forcefully ended by ${adminName}.\n` +
          `All players have been notified.`

        await bot.api.sendMessage(groupChatId, terminationMessage, { parse_mode: 'Markdown' })

        // Notify each player privately
        for (const player of game.players) {
          try {
            await bot.api.sendMessage(
              player.id,
              `🚨 **Game Terminated**\n\nYour Whot game in this group has been terminated by an administrator.`,
              { parse_mode: 'Markdown' }
            )
          } catch (error) {
            logger.warn('Failed to notify player of game termination', {
              playerId: player.id,
              groupChatId,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
      } catch (error) {
        logger.warn('Failed to send termination notifications', {
          groupChatId,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      // Store game info before clearing
      const gameInfo = `${game.state} (${game.players.length} players: ${game.players.map(p => p.firstName).join(', ')})`

      // Clear the game
      clearGame(groupChatId)

      await ctx.reply(`💀 **Game Killed Successfully**\n\nGame in this group: ${gameInfo}\n\nAll players have been notified.`, { parse_mode: 'Markdown' })

      logger.info('Admin killed ongoing game', {
        userId: ctx.from?.id,
        adminName: ctx.from.first_name,
        groupChatId,
        gameState: game.state,
        playerCount: game.players.length,
        players: game.players.map(p => ({ id: p.id, name: p.firstName }))
      })

    } catch (error) {
      await ctx.reply(`❌ Kill game failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      logger.error('Admin kill game failed', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })  // Command to show admin help
  bot.command('adminhelp', async (ctx) => {
    await updateAdminList(ctx)
    if (!ctx.from || !isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Admin access required')
      return
    }

    const adminHelpMessage = `🔧 **Admin Commands:**

**Game Management (Group Chats Only):**
• \`/killgame\` - Terminate the ongoing game in current group
• \`/forceclean\` - Force clean the game in current group  
• \`/forcestart\` - Force start a ready game in current group
• \`/cleangames\` - Clean up stale games (24+ hours old)

**Monitoring (Any Chat):**
• \`/persiststatus\` - Show persistence and memory status
• \`/listgames\` - List all active games
• \`/recovergames\` - Manually recover games from KV storage

**Help:**
• \`/adminhelp\` - Show this admin help message

� **Security Note:** Game management commands only work on the current group for security.`

    try {
      // Send the help message to the admin's private DM
      await bot.api.sendMessage(ctx.from.id, adminHelpMessage, { parse_mode: 'Markdown' })

      // Acknowledge in the current chat if it's not already a private chat
      if (ctx.chat.type !== 'private') {
        await ctx.reply('📨 Admin help sent to your private messages')
      }

      logger.info('Admin viewed help', { userId: ctx.from?.id, chatType: ctx.chat.type })
    } catch (error) {
      // If we can't send to DM (user hasn't started bot), fall back to current chat
      await ctx.reply(`❌ Unable to send DM. Please start a private chat with the bot first.\n\n${adminHelpMessage}`, { parse_mode: 'Markdown' })
      logger.warn('Failed to send admin help via DM', {
        userId: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })
}
