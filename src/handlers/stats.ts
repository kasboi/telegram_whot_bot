import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { GameSession } from '../types/game.ts'
import { logger } from '../utils/logger.ts'

/**
 * Determines how the game ended based on winner's card count
 */
function getGameEndingType(game: GameSession): 'normal_win' | 'tender_mode' | 'timeout' {
  // Check if winner has 0 cards (normal win by playing last card)
  if (game.winner && game.winner.hand?.length === 0) {
    return 'normal_win'
  }

  // If winner has cards, it ended in tender mode (deck exhaustion)
  if (game.winner && game.winner.hand && game.winner.hand.length > 0) {
    return 'tender_mode'
  }

  // If there's a tie, it's also tender mode
  if (game.tieResult && game.tieResult.length > 1) {
    return 'tender_mode'
  }

  // Default to timeout if we can't determine
  return 'timeout'
}

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
 * Gets appropriate message for non-winners based on their card count
 */
function getEncouragementMessage(cardCount: number): string {
  if (cardCount <= 2) {
    return 'So close!'
  } else if (cardCount <= 5) {
    return 'Well played!'
  } else {
    return 'Better luck next time!'
  }
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
  const endingType = getGameEndingType(game)

  for (const player of game.players) {
    try {
      const finalCardCount = player.hand?.length || 0

      if (player.id === winner.id) {
        // Winner's message - different based on how they won
        let victoryMessage: string
        let cardStatusMessage: string

        if (endingType === 'normal_win') {
          victoryMessage = '🏆 **PERFECT VICTORY!** 🏆\nYou played your last card and won!'
          cardStatusMessage = `• **Final cards:** ${finalCardCount} (Perfect!)`
        } else if (endingType === 'tender_mode') {
          victoryMessage = '🏆 **TENDER MODE VICTORY!** 🏆\nYou had the lowest cards when the deck ran out!'
          cardStatusMessage = `• **Final cards:** ${finalCardCount} (Lowest count!)`
        } else {
          victoryMessage = '🏆 **VICTORY BY DEFAULT!** 🏆\nYou won due to game timeout!'
          cardStatusMessage = `• **Final cards:** ${finalCardCount}`
        }

        const message = `${victoryMessage}\n\n` +
          `📊 **Your Performance:**\n` +
          `${cardStatusMessage}\n` +
          `• **Turns played:** ${player.cardsPlayedCount || 0}\n` +
          `• **Special cards used:** ${player.specialCardsPlayedCount || 0}\n` +
          `• **Game duration:** ${duration}\n\n` +
          `🎉 Well played! You outmaneuvered ${otherPlayersCount} other player${otherPlayersCount > 1 ? 's' : ''}!`

        await bot.api.sendMessage(player.id, message, { parse_mode: 'Markdown' })
      } else {
        // Other players' message - contextual encouragement
        const encouragement = getEncouragementMessage(finalCardCount)
        let gameEndContext: string

        if (endingType === 'normal_win') {
          gameEndContext = `${winner.firstName} played their last card`
        } else if (endingType === 'tender_mode') {
          gameEndContext = `${winner.firstName} had the fewest cards in tender mode`
        } else {
          gameEndContext = `${winner.firstName} won by default`
        }

        const message = `🎮 **Game Over!**\n` +
          `Winner: **${winner.firstName}** 🏆\n` +
          `Victory: ${gameEndContext}\n\n` +
          `📊 **Your Performance:**\n` +
          `• **Final cards:** ${finalCardCount} (${encouragement})\n` +
          `• **Turns played:** ${player.cardsPlayedCount || 0}\n` +
          `• **Special cards used:** ${player.specialCardsPlayedCount || 0}\n` +
          `• **Game duration:** ${duration}\n\n` +
          `💪 ${finalCardCount <= 2 ? 'You were almost there!' : 'Keep practicing and you\'ll get them next time!'}`

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
