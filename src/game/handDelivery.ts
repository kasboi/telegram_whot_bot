import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { sendPlayerHand } from '../handlers/private.ts'
import { logger } from '../utils/logger.ts'

/**
 * Enhanced player hand delivery with proper error handling and user notifications
 */
export interface HandDeliveryResult {
  success: boolean
  playerId: number
  playerName: string
  needsPrivateMessage: boolean
  errorMessage?: string
}

/**
 * Attempts to send a player's hand via private message with comprehensive error handling
 * @param bot - The bot instance
 * @param groupChatId - The group chat ID where the game is happening
 * @param playerId - The player's user ID
 * @param playerName - The player's display name
 * @returns Promise<HandDeliveryResult> - Result of the delivery attempt
 */
export async function deliverPlayerHand(
  bot: Bot,
  groupChatId: number,
  playerId: number,
  playerName: string
): Promise<HandDeliveryResult> {
  try {
    const success = await sendPlayerHand(bot, groupChatId, playerId, playerName)

    if (success) {
      logger.info('Player hand delivered successfully', {
        groupChatId,
        playerId,
        playerName,
        deliveryMethod: 'private_message'
      })

      return {
        success: true,
        playerId,
        playerName,
        needsPrivateMessage: false
      }
    } else {
      logger.warn('Player hand delivery failed - private message blocked', {
        groupChatId,
        playerId,
        playerName,
        reason: 'private_message_blocked'
      })

      return {
        success: false,
        playerId,
        playerName,
        needsPrivateMessage: true,
        errorMessage: `${playerName} needs to start a private chat with the bot`
      }
    }
  } catch (error) {
    logger.error('Player hand delivery error', {
      groupChatId,
      playerId,
      playerName,
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      playerId,
      playerName,
      needsPrivateMessage: true,
      errorMessage: `Failed to deliver cards to ${playerName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Delivers hands to all players in a game with comprehensive error handling
 * @param bot - The bot instance
 * @param groupChatId - The group chat ID
 * @param players - Array of players to send hands to
 * @returns Promise<HandDeliveryResult[]> - Results for all players
 */
export async function deliverAllPlayerHands(
  bot: Bot,
  groupChatId: number,
  players: Array<{ id: number; firstName: string }>
): Promise<HandDeliveryResult[]> {
  const results: HandDeliveryResult[] = []

  // Deliver hands to all players in parallel for better performance
  const deliveryPromises = players.map(player =>
    deliverPlayerHand(bot, groupChatId, player.id, player.firstName)
  )

  const deliveryResults = await Promise.all(deliveryPromises)
  results.push(...deliveryResults)

  logger.info('Batch hand delivery completed', {
    groupChatId,
    totalPlayers: players.length,
    successfulDeliveries: results.filter(r => r.success).length,
    failedDeliveries: results.filter(r => !r.success).length,
    playersNeedingPrivateMessage: results.filter(r => r.needsPrivateMessage).length
  })

  return results
}

/**
 * Generates user-friendly notifications for players who couldn't receive private messages
 * @param bot - The bot instance
 * @param groupChatId - The group chat ID
 * @param failedDeliveries - Array of failed delivery results
 * @returns Promise<void>
 */
export async function notifyPrivateMessageRequired(
  bot: Bot,
  groupChatId: number,
  failedDeliveries: HandDeliveryResult[]
): Promise<void> {
  if (failedDeliveries.length === 0) return

  const botInfo = await bot.api.getMe()
  const botUsername = botInfo.username

  let notificationMessage = '⚠️ **Action Required!** ⚠️\n\n'

  if (failedDeliveries.length === 1) {
    const player = failedDeliveries[0]
    notificationMessage +=
      `${player.playerName}, I couldn't send you your cards via private message!\n\n` +
      `📱 **To play the game:**\n` +
      `1. Click here: @${botUsername}\n` +
      `2. Send /start to the bot\n` +
      `3. Return here and use /mycards to get your hand\n\n` +
      `💡 This is required due to Telegram's privacy settings.`
  } else {
    notificationMessage +=
      `The following players need to start a private chat with me:\n\n`

    failedDeliveries.forEach((player, index) => {
      notificationMessage += `${index + 1}. ${player.playerName}\n`
    })

    notificationMessage +=
      `\n📱 **To receive your cards:**\n` +
      `1. Click here: @${botUsername}\n` +
      `2. Send /start to the bot\n` +
      `3. Return here and use /mycards\n\n` +
      `💡 This is required due to Telegram's privacy settings.\n` +
      `🎮 The game will wait for you to get your cards!`
  }

  try {
    await bot.api.sendMessage(groupChatId, notificationMessage, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true }
    })

    logger.info('Private message notification sent', {
      groupChatId,
      affectedPlayers: failedDeliveries.length,
      playerNames: failedDeliveries.map(p => p.playerName)
    })
  } catch (error) {
    logger.error('Failed to send private message notification', {
      groupChatId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
