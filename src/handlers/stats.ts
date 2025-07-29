import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { GameSession } from '../types/game.ts'
import { logger } from '../utils/logger.ts'

/**
 * Calculates the game duration in a readable format.
 */
function getGameDuration(startTime: Date): string {
  const durationMs = new Date().getTime() - startTime.getTime()
  const minutes = Math.floor(durationMs / 60000)
  const seconds = Math.floor((durationMs % 60000) / 1000)
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`
  }
  return `${seconds} second${seconds > 1 ? 's' : ''}`
}

/**
 * Sends personalized game statistics to each player at the end of the game.
 */
export async function sendGameStats(bot: Bot, game: GameSession): Promise<void> {
  const winner = game.winner
  if (!winner) {
    logger.error('sendGameStats called for a game with no winner', { gameId: game.id })
    return
  }

  const duration = getGameDuration(game.createdAt)
  const otherPlayersCount = game.players.length - 1

  for (const player of game.players) {
    try {
      if (player.id === winner.id) {
        // Winner's message
        const message = `🏆 **CONGRATULATIONS!** 🏆\n` +
          `You won the Whot game!\n\n` +
          `📊 **Your Performance:**\n` +
          `• **Final cards:** 0 (Perfect!)\n` +
          `• **Turns played:** ${player.cardsPlayedCount || 0}\n` +
          `• **Special cards used:** ${player.specialCardsPlayedCount || 0}\n` +
          `• **Game duration:** ${duration}\n\n` +
          `🎉 Well played! You outmaneuvered ${otherPlayersCount} other player${otherPlayersCount > 1 ? 's' : ''}!`

        await bot.api.sendMessage(player.id, message, { parse_mode: 'Markdown' })
      } else {
        // Other players' message
        const message = `🎮 **Game Over!**\n` +
          `Winner: **${winner.firstName}** 🏆\n\n` +
          `📊 **Your Performance:**\n` +
          `• **Final cards:** ${player.hand?.length || 0} (So close!)\n` +
          `• **Turns played:** ${player.cardsPlayedCount || 0}\n` +
          `• **Special cards used:** ${player.specialCardsPlayedCount || 0}\n` +
          `• **Game duration:** ${duration}\n\n` +
          `💪 Better luck next time! You were almost there!`

        await bot.api.sendMessage(player.id, message, { parse_mode: 'Markdown' })
      }
    } catch (error) {
      logger.error('Failed to send stats to player', {
        gameId: game.id,
        playerId: player.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
