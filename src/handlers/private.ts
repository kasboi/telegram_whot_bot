import { Bot, InlineKeyboard } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { getGame, getCurrentPlayer, getTopCard, playCard, drawCard, selectWhotSymbol } from '../game/state.ts'
import { getValidCards, formatCard, getCardEmoji } from '../game/cards.ts'
import { type Card } from '../types/game.ts'
import { logger } from '../utils/logger.ts'
import { generateGroupStatusMessage } from './updates.ts'
import { sendGameStats } from './stats.ts'
import { safeAnswerCallbackQuery } from '../utils/callback.ts'


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

  // Add game state information
  messageText += `🃏 Top card: ${formatCard(topCard)}\n`
  messageText += `📦 Deck: ${game.deck?.length || 0} cards left\n\n`

  // Show chosen symbol if active
  if (game.chosenSymbol) {
    const symbolEmojis: Record<string, string> = {
      circle: '⚪',
      triangle: '🔺',
      cross: '✖️',
      square: '🟦',
      star: '⭐'
    }
    messageText += `🎯 Active symbol: ${symbolEmojis[game.chosenSymbol]} ${game.chosenSymbol}\n`
  }

  // Show last game action (same as public announcements)
  if (game.lastActionMessage) {
    messageText += `📢 **Latest Action:**\n${game.lastActionMessage}\n\n`
  }

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
    messageText += `⏳ Waiting for ${currentPlayer?.firstName}'s turn\n`
  }

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
      await safeAnswerCallbackQuery(ctx, '❌ Game not found or not in progress')
      return
    }

    const currentPlayer = getCurrentPlayer(groupChatId)
    if (!currentPlayer || currentPlayer.id !== userId) {
      await safeAnswerCallbackQuery(ctx, '❌ Not your turn!')
      return
    }

    const player = game.players.find(p => p.id === userId)
    if (!player || !player.hand) {
      await safeAnswerCallbackQuery(ctx, '❌ Player not found')
      return
    }

    // Find the card index in player's hand
    const cardIndex = player.hand.findIndex(c => c.id === cardId)
    if (cardIndex === -1) {
      await safeAnswerCallbackQuery(ctx, '❌ Card not found in your hand')
      return
    }

    const cardToPlay = player.hand[cardIndex]

    const topCard = getTopCard(groupChatId)
    if (!topCard) {
      await safeAnswerCallbackQuery(ctx, '❌ No top card found')
      return
    }

    const validCards = getValidCards(player.hand, topCard, game.chosenSymbol)
    if (!validCards.some(c => c.id === cardId)) {
      await safeAnswerCallbackQuery(ctx, '❌ Invalid play - card doesn\'t match top card')
      return
    }

    // Play the card using game state logic
    const result = playCard(groupChatId, userId, cardIndex)

    if (!result.success) {
      await safeAnswerCallbackQuery(ctx, `❌ ${result.message}`)
      return
    }

    // Check if Whot card was played and needs symbol selection
    if (result.requiresSymbolChoice) {
      await safeAnswerCallbackQuery(ctx, `🃏 Whot played! Choose a symbol`)
      await showSymbolSelection(bot, userId, groupChatId)
      return
    }

    await safeAnswerCallbackQuery(ctx, `🎉 Played ${formatCard(cardToPlay)}!`)

    // Check if deck was reshuffled during card play (e.g., General Market)
    if (result.reshuffled) {
      const reshuffleMessage = `⚠️ **The deck ran out!** ⚠️\n\nThe discard pile has been shuffled to create a new deck.\n\nIf the deck runs out again, it's a **SUDDEN-DEATH SHOWDOWN!**`
      await bot.api.sendMessage(groupChatId, reshuffleMessage, { parse_mode: 'Markdown' })
    }

    // Prepare and store action message BEFORE updating hands
    const gameAfterPlay = getGame(groupChatId)
    if (gameAfterPlay) {
      if (result.gameEnded) {
        gameAfterPlay.lastActionMessage = `🏆 **${userName} WINS!** 🏆`
      } else {
        // Get target player for special effects
        const nextPlayerIndex = (gameAfterPlay.players.findIndex(p => p.id === userId) + 1) % gameAfterPlay.players.length
        const targetPlayer = gameAfterPlay.players[nextPlayerIndex]

        // Create and store the action message for private chats
        const actionMessage = getSpecialCardMessage(cardToPlay, userName, targetPlayer.firstName, gameAfterPlay.pendingEffect)
        gameAfterPlay.lastActionMessage = actionMessage
      }
    }

    // Update all players' hands to reflect turn change (now with correct action message)
    await updateAllPlayerHands(bot, groupChatId)

    // Announce play in group chat
    try {
      const gameForGroup = getGame(groupChatId)
      if (gameForGroup) {
        if (result.gameEnded) {
          await bot.api.sendMessage(groupChatId, `🏆 **${userName} WINS!** 🏆\n\nGame over! 🎉`, { parse_mode: 'Markdown' })
          await sendGameStats(bot, gameForGroup)
        } else {
          const announceMessage = generateGroupStatusMessage(gameForGroup)
          await bot.api.sendMessage(groupChatId, announceMessage, { parse_mode: 'Markdown' })
        }
      }
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
    if (!game || (game.state !== 'in_progress' && game.state !== 'ended')) {
      await safeAnswerCallbackQuery(ctx, '❌ Game not found or not in progress')
      return
    }

    const currentPlayer = getCurrentPlayer(groupChatId)
    if (!currentPlayer || currentPlayer.id !== userId) {
      await safeAnswerCallbackQuery(ctx, '❌ Not your turn!')
      return
    }

    // Draw a card using game state logic
    const result = drawCard(groupChatId, userId)

    if (!result.success) {
      await safeAnswerCallbackQuery(ctx, `❌ ${result.message}`)
      return
    }

    // --- Handle different draw outcomes ---

    if (result.gameEnded && result.tenderResult) {
      // Game ended with a Sudden-Death Showdown
      const { winner, scores } = result.tenderResult
      let tenderMessage = `🚨 **SUDDEN-DEATH SHOWDOWN!** 🚨\n\n`
      tenderMessage += `The deck ran out a second time! The game ends now. Lowest score wins.\n\n`
      tenderMessage += `**Final Scores:**\n`
      scores.forEach(s => {
        tenderMessage += `• ${s.name}: **${s.score}** points\n`
      })
      tenderMessage += `\n🏆 The winner is **${winner.firstName}**!`

      await bot.api.sendMessage(groupChatId, tenderMessage, { parse_mode: 'Markdown' })
      await safeAnswerCallbackQuery(ctx, 'The game has ended!')
      await sendGameStats(bot, game)
      return
    }

    if (result.reshuffled) {
      // Deck was reshuffled
      const reshuffleMessage = `⚠️ **The deck ran out!** ⚠️\n\nThe discard pile has been shuffled to create a new deck.\n\nIf the deck runs out again, it's a **SUDDEN-DEATH SHOWDOWN!**`
      await bot.api.sendMessage(groupChatId, reshuffleMessage, { parse_mode: 'Markdown' })
    }

    // Standard draw or penalty draw
    const wasPenalty = result.message.includes('due to pending effect')
    if (wasPenalty) {
      const cardCount = result.message.match(/(\d+)/)?.[1] || '?'
      await safeAnswerCallbackQuery(ctx, `📥 Drew ${cardCount} cards (penalty)`)
      if (game) game.lastActionMessage = `📥 **${userName}** drew ${cardCount} cards due to special effect`
    } else {
      await safeAnswerCallbackQuery(ctx, '🎴 Drew a card!')
      if (game) game.lastActionMessage = `🎴 **${userName}** drew a card`
    }

    // Update all players' hands and announce the new game state
    await updateAllPlayerHands(bot, groupChatId)
    try {
      const gameForGroup = getGame(groupChatId)
      if (gameForGroup) {
        const announceMessage = generateGroupStatusMessage(gameForGroup)
        await bot.api.sendMessage(groupChatId, announceMessage, { parse_mode: 'Markdown' })
      }
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
      await safeAnswerCallbackQuery(ctx, `❌ ${result.message}`)
      return
    }

    await safeAnswerCallbackQuery(ctx, `🎯 Symbol ${selectedSymbol} selected!`)

    // Store symbol selection action BEFORE updating hands
    const symbolEmojis: Record<string, string> = {
      circle: '⚪',
      triangle: '🔺',
      cross: '✖️',
      square: '🟦',
      star: '⭐'
    }
    const actionMessage = `🃏 **${userName}** played Whot and chose **${symbolEmojis[selectedSymbol]} ${selectedSymbol}**`

    const gameState = getGame(groupChatId)
    if (gameState) {
      gameState.lastActionMessage = actionMessage
    }

    // Update all players' hands to reflect turn change (now with correct action message)
    await updateAllPlayerHands(bot, groupChatId)

    // Announce symbol selection in group chat
    try {
      const gameForGroup = getGame(groupChatId)
      if (gameForGroup) {
        const announceMessage = generateGroupStatusMessage(gameForGroup)
        await bot.api.sendMessage(groupChatId, announceMessage, { parse_mode: 'Markdown' })
      }
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
