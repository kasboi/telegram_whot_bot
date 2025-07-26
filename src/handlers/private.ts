import { Bot, InlineKeyboard } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { getGame, getCurrentPlayer, getTopCard, playCard, drawCard, selectWhotSymbol } from '../game/state.ts'
import { getValidCards, formatCard, getCardEmoji } from '../game/cards.ts'
import { type Card } from '../types/game.ts'
import { logger } from '../utils/logger.ts'

// Send initial hand to player when game starts
export async function sendPlayerHand(bot: Bot, groupChatId: number, userId: number, firstName: string): Promise<boolean> {
  const game = getGame(groupChatId)
  if (!game || game.state !== 'in_progress') {
    logger.warn('Invalid hand request', { groupChatId, userId, gameState: game?.state || 'not_found' })
    return false
  }

  const player = game.players.find(p => p.id === userId)
  if (!player || !player.hand) {
    logger.warn('Player hand unavailable', { groupChatId, userId, playerFound: !!player, hasHand: !!player?.hand })
    return false
  }

  const topCard = getTopCard(groupChatId)
  if (!topCard) {
    logger.error('Missing top card', { groupChatId, discardPileSize: game.discardPile?.length || 0 })
    return false
  }

  const currentPlayer = getCurrentPlayer(groupChatId)
  const isPlayerTurn = currentPlayer?.id === userId

  // Get valid cards that can be played
  const validCards = getValidCards(player.hand, topCard, game.chosenSymbol)

  let messageText = `🎴 **Your Whot Hand** 🎴\n\n`
  messageText += `🃏 Top card: ${formatCard(topCard)}\n`
  messageText += `👤 Cards in hand: ${player.hand.length}\n\n`

  // Check for pending effects
  if (isPlayerTurn && game.pendingEffect) {
    if (game.pendingEffect.type === 'pick_cards') {
      const cardCount = game.pendingEffect.amount
      const stackMessage = cardCount > 2 && cardCount > 3 ? ` (stacked effect!)` : ''
      messageText += `⚠️ **PENALTY EFFECT!**${stackMessage}\n`
      messageText += `📥 You must play a Pick card or draw ${cardCount} cards\n\n`

      // Show only cards that can counter the effect
      const counterCards = validCards.filter(card => {
        // Whot CANNOT counter pick effects - only exact pick card types can counter
        if (game.pendingEffect?.cardType) {
          // Only the same type of pick card can counter
          return card.number === game.pendingEffect.cardType
        }
        // Fallback for legacy effects without cardType
        return card.number === 2 || card.number === 5
      })

      if (counterCards.length > 0) {
        messageText += `💚 You can counter with ${counterCards.length} card(s) or accept penalty\n\n`
      } else {
        messageText += `❌ No counter cards - click Draw to accept penalty\n\n`
      }
    }
  } else if (isPlayerTurn) {
    messageText += `🎯 **YOUR TURN!**\n`
    if (validCards.length > 0) {
      messageText += `💚 You can play ${validCards.length} card(s) or draw a card\n\n`
    } else {
      messageText += `❌ No valid plays - you can draw a card\n\n`
    }
  } else {
    messageText += `⏳ Waiting for ${currentPlayer?.firstName}'s turn\n\n`
  }

  messageText += `**Your cards:**`

  // Create keyboard with card buttons
  const keyboard = new InlineKeyboard()

  // Determine which cards to show
  let cardsToShow = player.hand
  if (isPlayerTurn && game.pendingEffect && game.pendingEffect.type === 'pick_cards') {
    // During pick effects, only show cards that can counter
    const counterCards = player.hand.filter(card => {
      // Whot CANNOT counter pick effects - only exact pick card types can counter
      if (game.pendingEffect?.cardType) {
        // Only the same type of pick card can counter
        return card.number === game.pendingEffect.cardType
      }
      // Fallback for legacy effects without cardType
      return card.number === 2 || card.number === 5
    })

    // If no counter cards available, show empty array (only draw button will appear)
    cardsToShow = counterCards.length > 0 ? counterCards : []
  }

  // Add cards in rows of 3
  for (let i = 0; i < cardsToShow.length; i += 3) {
    const row = cardsToShow.slice(i, i + 3)

    row.forEach((card, index) => {
      const canPlay = isPlayerTurn && validCards.some(vc => vc.id === card.id)
      const emoji = getCardEmoji(card)
      const buttonText = canPlay ? `${emoji} ${card.number}` : `🔒   ${emoji} ${card.number}`

      if (index === 0) {
        keyboard.text(buttonText, `play_${groupChatId}_${card.id}`)
      } else {
        keyboard.text(buttonText, `play_${groupChatId}_${card.id}`)
      }
    })

    // Start new row after every 3 cards (except for last row)
    if (i + 3 < cardsToShow.length) {
      keyboard.row()
    }
  }

  // Add draw card button if it's player's turn (always available)
  if (isPlayerTurn) {
    keyboard.row().text('🎴 Draw Card', `draw_${groupChatId}`)
  }

  try {
    await bot.api.sendMessage(userId, messageText, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    })

    logger.info('Hand sent', {
      groupChatId,
      userId,
      firstName,
      handSize: player.hand.length,
      validMoves: validCards.length,
      isPlayerTurn
    })

    return true // Success
  } catch (error) {
    logger.error('Hand delivery failed', {
      groupChatId,
      userId,
      error: error instanceof Error ? error.message : String(error)
    })

    return false // Failed
  }
}

// Handle card play button clicks
export function handleCardPlay(bot: Bot) {
  bot.callbackQuery(/^play_(-?\d+)_(.+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1])
    const cardId = ctx.match![2]
    const userId = ctx.from.id
    const userName = ctx.from.first_name || 'Unknown'

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

    // Find the card index in player's hand
    const cardIndex = player.hand.findIndex(c => c.id === cardId)
    if (cardIndex === -1) {
      await ctx.answerCallbackQuery('❌ Card not found in your hand')
      return
    }

    const cardToPlay = player.hand[cardIndex]

    const topCard = getTopCard(groupChatId)
    if (!topCard) {
      await ctx.answerCallbackQuery('❌ No top card found')
      return
    }

    const validCards = getValidCards(player.hand, topCard, game.chosenSymbol)
    if (!validCards.some(c => c.id === cardId)) {
      await ctx.answerCallbackQuery('❌ Invalid play - card doesn\'t match top card')
      return
    }

    // Play the card using game state logic
    const result = playCard(groupChatId, userId, cardIndex)

    if (!result.success) {
      await ctx.answerCallbackQuery(`❌ ${result.message}`)
      return
    }

    // Check if Whot card was played and needs symbol selection
    if (result.requiresSymbolChoice) {
      await ctx.answerCallbackQuery(`🃏 Whot played! Choose a symbol`)
      await showSymbolSelection(bot, userId, groupChatId)
      return
    }

    await ctx.answerCallbackQuery(`🎉 Played ${formatCard(cardToPlay)}!`)

    // Update all players' hands to reflect turn change
    await updateAllPlayerHands(bot, groupChatId)

    // Announce play in group chat
    try {
      const game = getGame(groupChatId)
      const newTopCard = getTopCard(groupChatId)
      const currentPlayer = getCurrentPlayer(groupChatId)

      let announceMessage = ''

      if (game && game.state === 'ended') {
        announceMessage = `� **${userName} WINS!** 🏆\n\nGame over! 🎉`
      } else {
        // Get target player for special effects
        const nextPlayerIndex = (game!.players.findIndex(p => p.id === userId) + 1) % game!.players.length
        const targetPlayer = game!.players[nextPlayerIndex]

        // Use special card message
        announceMessage = getSpecialCardMessage(cardToPlay, userName, targetPlayer.firstName, game!.pendingEffect)

        announceMessage += `\n\n🃏 Top card: ${formatCard(newTopCard!)}`

        if (!result.requiresSymbolChoice) {
          announceMessage += `\n🎯 Current turn: **${currentPlayer?.firstName}**`
        }
      }

      await bot.api.sendMessage(groupChatId, announceMessage, { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Announcement failed', { groupChatId, userId, error: error instanceof Error ? error.message : String(error) })
    }
  })
}

// Handle draw card button clicks
export function handleDrawCard(bot: Bot) {
  bot.callbackQuery(/^draw_(-?\d+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1])
    const userId = ctx.from.id
    const userName = ctx.from.first_name || 'Unknown'

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

    // Draw a card using game state logic
    const result = drawCard(groupChatId, userId)

    if (!result.success) {
      await ctx.answerCallbackQuery(`❌ ${result.message}`)
      return
    }

    // Check if this was a penalty draw or normal draw
    const gameState = getGame(groupChatId)
    const wasPenalty = result.message.includes('due to pending effect')

    if (wasPenalty) {
      // Extract number of cards from message
      const cardCount = result.message.match(/(\d+)/)?.[1] || '?'
      await ctx.answerCallbackQuery(`📥 Drew ${cardCount} cards (penalty)`)

      // Announce penalty in group
      try {
        const currentPlayer = getCurrentPlayer(groupChatId)
        const topCard = getTopCard(groupChatId)
        await bot.api.sendMessage(groupChatId,
          `📥 **${userName}** drew ${cardCount} cards due to special effect\n\n🃏 Top card: ${formatCard(topCard!)}\n🎯 Current turn: **${currentPlayer?.firstName}**`,
          { parse_mode: 'Markdown' }
        )
      } catch (error) {
        logger.error('Failed to announce penalty draw', { groupChatId, userId, error })
      }
    } else {
      await ctx.answerCallbackQuery('🎴 Drew a card!')
    }

    // Update all players' hands to reflect turn change
    await updateAllPlayerHands(bot, groupChatId)

    // Announce draw in group chat
    try {
      const currentPlayer = getCurrentPlayer(groupChatId)
      const topCard = getTopCard(groupChatId)
      const announceMessage = `🎴 **${userName}** drew a card\n\n🃏 Top card: ${formatCard(topCard!)}\n🎯 Current turn: **${currentPlayer?.firstName}**`

      await bot.api.sendMessage(groupChatId, announceMessage, { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Announcement failed', { groupChatId, userId, error: error instanceof Error ? error.message : String(error) })
    }
  })
}

// Update all players' hands after a game state change
export async function updateAllPlayerHands(bot: Bot, groupChatId: number) {
  const game = getGame(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return
  }

  for (const player of game.players) {
    await sendPlayerHand(bot, groupChatId, player.id, player.firstName)
  }
}

// Show symbol selection interface for Whot cards
async function showSymbolSelection(bot: Bot, userId: number, groupChatId: number): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('⚪ Circle', `symbol_${groupChatId}_circle`)
    .text('🔺 Triangle', `symbol_${groupChatId}_triangle`)
    .row()
    .text('✖️ Cross', `symbol_${groupChatId}_cross`)
    .text('🟦 Square', `symbol_${groupChatId}_square`)
    .row()
    .text('⭐ Star', `symbol_${groupChatId}_star`)

  const message = `🃏 **Whot Card Played!**\n\nChoose the new symbol for the next player:`

  try {
    await bot.api.sendMessage(userId, message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    })
  } catch (error) {
    logger.error('Failed to send symbol selection', { userId, groupChatId, error })
  }
}

// Handle symbol selection for Whot cards
export function handleSymbolSelection(bot: Bot) {
  bot.callbackQuery(/^symbol_(-?\d+)_(\w+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1])
    const selectedSymbol = ctx.match![2]
    const userId = ctx.from.id
    const userName = ctx.from.first_name || 'Unknown'

    const result = selectWhotSymbol(groupChatId, userId, selectedSymbol)

    if (!result.success) {
      await ctx.answerCallbackQuery(`❌ ${result.message}`)
      return
    }

    await ctx.answerCallbackQuery(`🎯 Symbol ${selectedSymbol} selected!`)

    // Update all players' hands to reflect turn change
    await updateAllPlayerHands(bot, groupChatId)

    // Announce symbol selection in group chat
    try {
      const currentPlayer = getCurrentPlayer(groupChatId)
      const newTopCard = getTopCard(groupChatId)

      const symbolEmojis: Record<string, string> = {
        circle: '⚪',
        triangle: '🔺',
        cross: '✖️',
        square: '🟦',
        star: '⭐'
      }

      const announceMessage = `🃏 **${userName}** played Whot and chose **${symbolEmojis[selectedSymbol]} ${selectedSymbol}**\n\n` +
        `🃏 Top card: ${formatCard(newTopCard!)}\n` +
        `🎯 Current turn: **${currentPlayer?.firstName}**`

      await bot.api.sendMessage(groupChatId, announceMessage, { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Announcement failed', { groupChatId, userId, error: error instanceof Error ? error.message : String(error) })
    }
  })
}

// Get special card effect message for public announcements
function getSpecialCardMessage(cardToPlay: Card, playerName: string, targetPlayerName?: string, pendingEffect?: { type: string; amount: number }): string {
  const cardEmoji = getCardEmoji(cardToPlay)

  if (cardToPlay.number === 1) {
    return `🔄 **${playerName}** played Hold On ${cardEmoji} ${cardToPlay.number} - gets another turn!`
  } else if (cardToPlay.number === 2) {
    const totalCards = pendingEffect ? pendingEffect.amount : 2
    const stackMessage = pendingEffect && pendingEffect.amount > 2 ? ` (stacked to ${totalCards} cards!)` : ''
    return `📥 **${playerName}** played Pick Two ${cardEmoji} ${cardToPlay.number}${stackMessage} \n **${targetPlayerName}** must counter or draw ${totalCards} cards`
  } else if (cardToPlay.number === 5) {
    const totalCards = pendingEffect ? pendingEffect.amount : 3
    const stackMessage = pendingEffect && pendingEffect.amount > 3 ? ` (stacked to ${totalCards} cards!)` : ''
    return `📥 **${playerName}** played Pick Three ${cardEmoji} ${cardToPlay.number}${stackMessage} \n **${targetPlayerName}** must counter or draw ${totalCards} cards`
  } else if (cardToPlay.number === 8) {
    return `⏭️ **${playerName}** played Suspension ${cardEmoji} ${cardToPlay.number} \n **${targetPlayerName}** is skipped!`
  } else if (cardToPlay.number === 14) {
    return `🏪 **${playerName}** played General Market ${cardEmoji} ${cardToPlay.number} \n All other players draw 1 card`
  } else if (cardToPlay.number === 20) {
    return `🃏 **${playerName}** played Whot ${cardEmoji} ${cardToPlay.number} - choose new symbol`
  }

  return `🎴 **${playerName}** played ${cardEmoji} ${cardToPlay.number}`
}
