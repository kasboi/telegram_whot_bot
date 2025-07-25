import { Bot, Context, InlineKeyboard } from "https://deno.land/x/grammy@v1.37.0/mod.ts"
import { createGame, getGame, addPlayer, canStartGame, startGameWithCards, getCurrentPlayer, getTopCard } from '../game/state.ts'
import { logger } from '../utils/logger.ts'
import { formatCard } from '../game/cards.ts'
import { sendPlayerHand } from './private.ts'

export function handleStartGame(bot: Bot) {
  bot.command('startgame', async (ctx: Context) => {
    // Only allow in group chats
    if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
      await ctx.reply('❌ This command only works in group chats!')
      return
    }

    const groupChatId = ctx.chat.id
    const creatorId = ctx.from?.id
    const creatorName = ctx.from?.first_name || 'Unknown'

    if (!creatorId) {
      await ctx.reply('❌ Could not identify user.')
      return
    }

    // Check if game already exists
    const existingGame = getGame(groupChatId)
    if (existingGame && existingGame.state !== 'idle' && existingGame.state !== 'ended') {
      await ctx.reply('🎮 A game is already in progress in this group!')
      return
    }

    // Create new game
    createGame(groupChatId, creatorId, creatorName)
    logger.info('Game created', { groupChatId, creatorId, creatorName })

    // Automatically add the creator to the game
    addPlayer(groupChatId, creatorId, creatorName)
    logger.info('Creator auto-joined game', { groupChatId, creatorId, creatorName })

    // Create join button
    const keyboard = new InlineKeyboard()
      .text('🃏 Join Game', `join_${groupChatId}`)

    logger.info('Creating join button with callback data', {
      callbackData: `join_${groupChatId}`,
      groupChatId
    })

    await ctx.reply(
      `🎴 **Whot Game Started!** 🎴\n\n` +
      `🎯 Game created by ${creatorName}\n` +
      `👥 Players: ${creatorName} (1)\n` +
      `⏳ Need at least 1 more player to start\n\n` +
      `Click the button below to join:`,
      {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
      }
    )
  })
}

export function handleJoinGame(bot: Bot) {
  // Debug: Log all callback queries to see what we're receiving
  bot.on('callback_query:data', async (ctx, next) => {
    logger.info('All callback query data received', {
      data: ctx.callbackQuery.data,
      userId: ctx.from.id,
      userName: ctx.from.first_name
    })
    await next()
  })

  bot.callbackQuery(/^join_(-?\d+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1])
    const userId = ctx.from.id
    const userName = ctx.from.first_name || 'Unknown'

    logger.info('Join game button clicked - MATCHED REGEX', { groupChatId, userId, userName })

    const success = addPlayer(groupChatId, userId, userName)

    if (!success) {
      const game = getGame(groupChatId)
      let errorMessage = '❌ Could not join game'

      if (!game) {
        errorMessage = '❌ Game not found'
      } else if (game.players.some(p => p.id === userId)) {
        errorMessage = '✅ You are already in this game!'
      } else if (game.state === 'in_progress') {
        errorMessage = '❌ Game has already started'
      } else {
        errorMessage = '❌ Cannot join game at this time'
      }

      await ctx.answerCallbackQuery({ text: errorMessage, show_alert: true })
      logger.warn('Join game failed', { groupChatId, userId, reason: errorMessage })
      return
    }

    const game = getGame(groupChatId)
    if (!game) {
      await ctx.answerCallbackQuery({ text: '❌ Game not found', show_alert: true })
      logger.error('Game disappeared after successful join', { groupChatId, userId })
      return
    }

    await ctx.answerCallbackQuery({ text: `✅ You joined the game!`, show_alert: false })

    // Update the message with current players and start button if ready
    let messageText = `🎴 **Whot Game** 🎴\n\n` +
      `🎯 Created by: Creator\n` +
      `👥 Players (${game.players.length}):\n`

    game.players.forEach((player, index) => {
      messageText += `${index + 1}. ${player.firstName}\n`
    })

    let keyboard = new InlineKeyboard()
      .text('🃏 Join Game', `join_${groupChatId}`)

    // Add start button if game is ready
    if (game.state === 'ready_to_start') {
      messageText += `\n✅ Ready to start! (Creator can tap "Start Game")`
      keyboard = keyboard
        .row()
        .text('🚀 Start Game', `start_${groupChatId}`)
    }

    await ctx.editMessageText(messageText, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    })

    logger.info('Join game successful', {
      groupChatId,
      totalPlayers: game.players.length,
      gameState: game.state
    })
  })
}

export function handleStartButton(bot: Bot) {
  bot.callbackQuery(/^start_(-?\d+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1])
    const userId = ctx.from.id

    logger.info('Start game button clicked', { groupChatId, userId })

    if (!canStartGame(groupChatId, userId)) {
      await ctx.answerCallbackQuery({
        text: '❌ Only the game creator can start the game when ready!',
        show_alert: true
      })
      logger.warn('Non-creator attempted to start game', { groupChatId, userId })
      return
    }

    const game = getGame(groupChatId)
    if (!game) {
      await ctx.answerCallbackQuery('❌ Game not found')
      return
    }

    // Start the game with card dealing
    const success = startGameWithCards(groupChatId)
    if (!success) {
      await ctx.answerCallbackQuery('❌ Failed to start game')
      return
    }

    // Get updated game state
    const currentPlayer = getCurrentPlayer(groupChatId)
    const topCard = getTopCard(groupChatId)

    await ctx.answerCallbackQuery('🎮 Game started!')

    // Update message to show game has started
    let messageText = `🎮 **Whot Game - IN PROGRESS** 🎮\n\n` +
      `👥 Players:\n`

    game.players.forEach((player, index) => {
      const isCurrentPlayer = index === game.currentPlayerIndex
      const turnIndicator = isCurrentPlayer ? '👉' : '✅'
      messageText += `${index + 1}. ${player.firstName} ${turnIndicator} (${player.hand?.length || 0} cards)\n`
    })

    messageText += `\n🃏 Top card: ${formatCard(topCard!)}\n`
    messageText += `🎯 Current turn: ${currentPlayer?.firstName}\n`
    messageText += `\n📱 Players will receive their cards in private chat.`

    await ctx.editMessageText(messageText, {
      parse_mode: 'Markdown'
    })

    // Send cards to each player in private chat
    for (const player of game.players) {
      await sendPlayerHand(bot, groupChatId, player.id, player.firstName)
    }

    logger.info(`Game started in group ${groupChatId} with ${game.players.length} players`, {
      topCard: topCard?.id,
      currentPlayer: currentPlayer?.firstName
    })
  })
}
