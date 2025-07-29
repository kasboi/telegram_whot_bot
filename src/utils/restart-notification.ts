import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { logger } from '../utils/logger.ts'
import { getMemoryStore } from '../game/state.ts'

/**
 * Notifies all active games that the bot has restarted
 * This helps players understand why their previous button clicks may have failed
 */
export async function notifyBotRestart(bot: Bot): Promise<void> {
  try {
    const memoryStore = getMemoryStore()
    const activeGames = Array.from(memoryStore.values()).filter(game =>
      game.state === 'in_progress' || game.state === 'waiting_for_players'
    )

    if (activeGames.length === 0) {
      logger.info('No active games to notify about restart')
      return
    }

    logger.info('Notifying active games about bot restart', { gameCount: activeGames.length })

    const notificationPromises = activeGames.map(async (game) => {
      try {
        const restartMessage =
          '🔄 **Bot Restarted** 🔄\n\n' +
          '✅ Your game has been recovered and continues normally!\n' +
          '⚠️ If you clicked any buttons while the bot was down, please try again.\n\n' +
          `🎮 Current status: ${game.state === 'in_progress' ? 'Game in progress' : 'Waiting for players'}`

        await bot.api.sendMessage(game.id, restartMessage, {
          parse_mode: 'Markdown',
          disable_notification: true // Don't spam users with notifications
        })

        logger.debug('Restart notification sent', {
          groupChatId: game.id,
          gameState: game.state
        })
      } catch (error) {
        logger.warn('Failed to send restart notification', {
          groupChatId: game.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })

    await Promise.allSettled(notificationPromises)
    logger.info('Bot restart notifications completed', { gameCount: activeGames.length })

  } catch (error) {
    logger.error('Failed to send bot restart notifications', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Enhanced restart notification that includes game-specific context
 */
export async function notifyBotRestartWithContext(bot: Bot): Promise<void> {
  try {
    const memoryStore = getMemoryStore()
    const activeGames = Array.from(memoryStore.values()).filter(game =>
      game.state === 'in_progress' || game.state === 'waiting_for_players'
    )

    if (activeGames.length === 0) {
      logger.info('No active games to notify about restart')
      return
    }

    logger.info('Sending enhanced restart notifications', { gameCount: activeGames.length })

    for (const game of activeGames) {
      try {
        let contextualMessage = '🔄 **Bot Restarted & Game Recovered** 🔄\n\n'

        if (game.state === 'in_progress') {
          const currentPlayer = game.players[game.currentPlayerIndex!]
          contextualMessage += `🎮 **Game continues normally!**\n`
          contextualMessage += `👤 Current turn: **${currentPlayer.firstName}**\n`

          if (game.pendingEffect) {
            const targetPlayer = game.players[game.pendingEffect.targetPlayerIndex!]
            contextualMessage += `⚠️ Pending effect: ${targetPlayer.firstName} must draw ${game.pendingEffect.amount} cards\n`
          }

          contextualMessage += `🃏 Players: ${game.players.map(p => `${p.firstName} (${p.hand?.length || 0})`).join(', ')}\n\n`
        } else {
          contextualMessage += `🕐 **Waiting for players to join**\n`
          contextualMessage += `👥 Current players: ${game.players.map(p => p.firstName).join(', ')}\n\n`
        }

        contextualMessage += '💡 **If you clicked buttons while bot was down, please try again.**'

        await bot.api.sendMessage(game.id, contextualMessage, {
          parse_mode: 'Markdown',
          disable_notification: true
        })

        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100))

        logger.debug('Enhanced restart notification sent', {
          groupChatId: game.id,
          gameState: game.state,
          playerCount: game.players.length
        })
      } catch (error) {
        logger.warn('Failed to send enhanced restart notification', {
          groupChatId: game.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    logger.info('Enhanced restart notifications completed', { gameCount: activeGames.length })

  } catch (error) {
    logger.error('Failed to send enhanced restart notifications', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
