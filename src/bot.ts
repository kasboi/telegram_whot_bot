import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { handleStartGame, handleJoinGame, handleStartButton, handleMyCards } from './handlers/commands.ts'
import { handleCardPlay, handleDrawCard, handleSymbolSelection } from './handlers/private.ts'
import { logger } from './utils/logger.ts'

import "jsr:@std/dotenv/load"

// Get bot token from environment
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
if (!botToken) {
  logger.error('TELEGRAM_BOT_TOKEN environment variable is required')
  Deno.exit(1)
}

// Create bot instance
const bot = new Bot(botToken)

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
handleJoinGame(bot)
handleStartButton(bot)
handleMyCards(bot)

// Register private chat handlers
handleCardPlay(bot)
handleDrawCard(bot)
handleSymbolSelection(bot)

// Basic start message
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

// Start the bot
logger.info('Starting Whot Game Bot...')
logger.info('Bot is running and waiting for messages')
bot.start()