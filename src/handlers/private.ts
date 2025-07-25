import { Bot, InlineKeyboard } from "https://deno.land/x/grammy@v1.37.0/mod.ts"
import { getGame, getCurrentPlayer, getTopCard } from '../game/state.ts'
import { getValidCards, formatCard, getCardEmoji } from '../game/cards.ts'
import { logger } from '../utils/logger.ts'

// Send initial hand to player when game starts
export async function sendPlayerHand(bot: Bot, groupChatId: number, userId: number, firstName: string) {
  const game = getGame(groupChatId)
  if (!game || game.state !== 'in_progress') {
    logger.warn('Attempted to send hand for invalid game', { groupChatId, userId })
    return
  }

  const player = game.players.find(p => p.id === userId)
  if (!player || !player.hand) {
    logger.warn('Player not found or has no hand', { groupChatId, userId })
    return
  }

  const topCard = getTopCard(groupChatId)
  if (!topCard) {
    logger.warn('No top card found', { groupChatId })
    return
  }

  const currentPlayer = getCurrentPlayer(groupChatId)
  const isPlayerTurn = currentPlayer?.id === userId

  // Get valid cards that can be played
  const validCards = getValidCards(player.hand, topCard)

  let messageText = `🎴 **Your Whot Hand** 🎴\n\n`
  messageText += `🃏 Top card: ${formatCard(topCard)}\n`
  messageText += `👤 Cards in hand: ${player.hand.length}\n\n`

  if (isPlayerTurn) {
    messageText += `🎯 **YOUR TURN!**\n`
    if (validCards.length > 0) {
      messageText += `💚 You can play ${validCards.length} card(s)\n\n`
    } else {
      messageText += `❌ No valid plays - you must draw a card\n\n`
    }
  } else {
    messageText += `⏳ Waiting for ${currentPlayer?.firstName}'s turn\n\n`
  }

  messageText += `**Your cards:**`

  // Create keyboard with card buttons
  const keyboard = new InlineKeyboard()

  // Add cards in rows of 3
  for (let i = 0; i < player.hand.length; i += 3) {
    const row = player.hand.slice(i, i + 3)

    row.forEach((card, index) => {
      const canPlay = isPlayerTurn && validCards.some(vc => vc.id === card.id)
      const emoji = getCardEmoji(card)
      const buttonText = canPlay ? `${emoji} ${card.number}` : `🔒 ${card.number}`

      if (index === 0) {
        keyboard.text(buttonText, `play_${groupChatId}_${card.id}`)
      } else {
        keyboard.text(buttonText, `play_${groupChatId}_${card.id}`)
      }
    })

    // Start new row after every 3 cards (except for last row)
    if (i + 3 < player.hand.length) {
      keyboard.row()
    }
  }

  // Add draw card button if it's player's turn and no valid plays
  if (isPlayerTurn && validCards.length === 0) {
    keyboard.row().text('🎴 Draw Card', `draw_${groupChatId}`)
  }

  try {
    await bot.api.sendMessage(userId, messageText, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    })

    logger.info('Hand sent to player', {
      groupChatId,
      userId,
      firstName,
      cardCount: player.hand.length,
      validPlays: validCards.length,
      isPlayerTurn
    })
  } catch (error) {
    logger.error('Failed to send hand to player', {
      groupChatId,
      userId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

// Handle card play button clicks
export function handleCardPlay(bot: Bot) {
  bot.callbackQuery(/^play_(-?\d+)_(.+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1])
    const cardId = ctx.match![2]
    const userId = ctx.from.id
    const userName = ctx.from.first_name || 'Unknown'

    logger.info('Card play attempted', { groupChatId, userId, cardId, userName })

    const game = getGame(groupChatId)
    if (!game || game.state !== 'in_progress') {
      await ctx.answerCallbackQuery('❌ Game not found or not in progress')
      return
    }

    const currentPlayer = getCurrentPlayer(groupChatId)
    if (!currentPlayer || currentPlayer.id !== userId) {
      await ctx.answerCallbackQuery('❌ Not your turn!')
      return
    }

    const player = game.players.find(p => p.id === userId)
    if (!player || !player.hand) {
      await ctx.answerCallbackQuery('❌ Player not found')
      return
    }

    const cardToPlay = player.hand.find(c => c.id === cardId)
    if (!cardToPlay) {
      await ctx.answerCallbackQuery('❌ Card not found in your hand')
      return
    }

    const topCard = getTopCard(groupChatId)
    if (!topCard) {
      await ctx.answerCallbackQuery('❌ No top card found')
      return
    }

    const validCards = getValidCards(player.hand, topCard)
    if (!validCards.some(c => c.id === cardId)) {
      await ctx.answerCallbackQuery('❌ Invalid play - card doesn\'t match top card')
      return
    }

    // TODO: Implement actual card play logic
    await ctx.answerCallbackQuery('🚧 Card play logic coming soon!')

    logger.info('Valid card play detected', { groupChatId, userId, cardId, cardSymbol: cardToPlay.symbol, cardNumber: cardToPlay.number })
  })
}

// Handle draw card button clicks
export function handleDrawCard(bot: Bot) {
  bot.callbackQuery(/^draw_(-?\d+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1])
    const userId = ctx.from.id
    const userName = ctx.from.first_name || 'Unknown'

    logger.info('Draw card attempted', { groupChatId, userId, userName })

    const game = getGame(groupChatId)
    if (!game || game.state !== 'in_progress') {
      await ctx.answerCallbackQuery('❌ Game not found or not in progress')
      return
    }

    const currentPlayer = getCurrentPlayer(groupChatId)
    if (!currentPlayer || currentPlayer.id !== userId) {
      await ctx.answerCallbackQuery('❌ Not your turn!')
      return
    }

    // TODO: Implement actual draw card logic
    await ctx.answerCallbackQuery('🚧 Draw card logic coming soon!')

    logger.info('Valid draw card attempt', { groupChatId, userId })
  })
}
