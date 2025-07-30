import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { handleStartGame, handleCallbackQuery, handleMyCards, handleHelp, handleHowToPlay } from './handlers/commands.ts'
import { handleCardPlay, handleDrawCard, handleSymbolSelection } from './handlers/private.ts'
import { handleAdminCommands } from './handlers/admin.ts'
import { logger } from './utils/logger.ts'
import { initPersistence } from './game/state.ts'
import { notifyBotRestartWithContext } from './utils/restart-notification.ts'
import { initTimeoutManager } from './game/timeouts.ts'
import { checkDowntimeAndCleanup, recordShutdownTime } from './utils/downtime-cleanup.ts'

import "jsr:@std/dotenv/load"
import { jsonLogger } from "./utils/logger.json.ts"

// Get bot token from environment
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')

// Validate bot token
if (!botToken) {
  logger.error('TELEGRAM_BOT_TOKEN environment variable is required')
  Deno.exit(1)
}


// Create bot instance
export const bot = new Bot(botToken)

// Add debug logging for all callback queries
bot.on('callback_query', async (ctx, next) => {
  logger.info('Callback query received', {
    data: ctx.callbackQuery.data,
    userId: ctx.from.id,
    userName: ctx.from.first_name
  })
  await next()
})

// Register command handlers
handleStartGame(bot)
handleCallbackQuery(bot)
handleMyCards(bot)
handleHelp(bot)
handleHowToPlay(bot)

// Register admin commands
handleAdminCommands(bot)

// Register private chat handlers
handleCardPlay(bot)
handleDrawCard(bot)
handleSymbolSelection(bot)

// Handle /start command
bot.command('start', async (ctx) => {
  const chatType = ctx.chat.type

  if (chatType === 'private') {
    await ctx.reply(
      '🎴 Welcome to Whot Game Bot! 🎴\n\n' +
      '🎯 Add me to a group chat and use /startgame to begin playing!\n' +
      '👥 You need at least 2 players to start a game.'
    )
    logger.info('Start command in private chat', { userId: ctx.from?.id })
  } else {
    await ctx.reply(
      '🎴 Whot Game Bot is ready! 🎴\n\n' +
      '🚀 Use /startgame to create a new game in this group!'
    )
    logger.info('Start command in group chat', { chatId: ctx.chat.id })
  }
})

// Error handling
bot.catch((err) => {
  logger.error('Bot error occurred', { error: err.message, stack: err.stack })
})

// Set up bot commands that appear in the "/" menu
async function setupBotCommands() {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Welcome message and bot info' },
    { command: 'startgame', description: 'Start a new Whot game (group chats only)' },
    { command: 'mycards', description: 'Get your cards in private message' },
    { command: 'help', description: 'Show help information' },
    { command: 'howtoplay', description: 'Learn how to play Whot' },
    // Admin commands are not shown in public menu for security
  ])
  logger.info('Bot commands registered successfully')
}

// Initialize the bot (called from webhook handler)
export async function initBot() {
  try {
    // Check for extended downtime and cleanup if necessary
    const { wasLongDowntime, cleanedGames } = await checkDowntimeAndCleanup()

    if (wasLongDowntime) {
      logger.warn('Extended downtime detected - performed complete cleanup', {
        cleanedGames,
        message: 'All game sessions have been cleared due to extended bot downtime'
      })
    }

    // Initialize persistence layer
    await initPersistence()

    // Initialize timeout manager
    initTimeoutManager(bot)

    await setupBotCommands()
    logger.info('Whot Game Bot initialized for webhook mode')
    jsonLogger.info('Whot Game Bot initialized for webhook mode')

    // Notify active games that bot has restarted (only if not cleaned up)
    if (!wasLongDowntime) {
      await notifyBotRestartWithContext(bot)
    } else {
      logger.info('Skipping restart notifications due to cleanup after extended downtime')
    }

    return true
  } catch (error) {
    logger.error('Failed to initialize bot', { error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

// For development/local testing - keep the polling version
async function startBotPolling() {
  const success = await initBot()
  if (!success) {
    Deno.exit(1)
  }

  try {
    bot.start()
  } catch (error) {
    logger.error('Failed to start bot', { error: error instanceof Error ? error.message : String(error) })
    Deno.exit(1)
  }
}

// Only start polling if running directly (not imported for webhook)
if (import.meta.main) {
  // Graceful shutdown handling for polling mode
  const shutdownHandler = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`)

    try {
      // Record shutdown time for downtime tracking
      await recordShutdownTime()

      // Stop the bot
      await bot.stop()

      logger.info('Bot shutdown completed')
      Deno.exit(0)
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error)
      })
      Deno.exit(1)
    }
  }

  // Register signal handlers for graceful shutdown
  Deno.addSignalListener('SIGINT', () => shutdownHandler('SIGINT'))
  Deno.addSignalListener('SIGTERM', () => shutdownHandler('SIGTERM'))

  // Handle unexpected exits
  globalThis.addEventListener('beforeunload', () => {
    recordShutdownTime().catch(error => {
      logger.error('Failed to record shutdown time on beforeunload', { error })
    })
  })

  startBotPolling()
}
