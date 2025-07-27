import { GameSession } from '../types/game.ts'
import { formatCard } from '../game/cards.ts'
import { getCurrentPlayer, getTopCard } from '../game/state.ts'

/**
 * Generates a comprehensive status message for the group chat.
 * This message serves as the public "game board".
 */
export function generateGroupStatusMessage(game: GameSession): string {
  const topCard = getTopCard(game.id)
  const currentPlayer = getCurrentPlayer(game.id)

  if (!topCard || !currentPlayer) {
    return 'Error: Could not retrieve game details.'
  }

  let message = `🎮 **Whot Game Status** 🎮\n\n`

  // Player list with card counts
  message += `👥 **Players:**\n`
  game.players.forEach((player, index) => {
    const isCurrent = index === game.currentPlayerIndex
    const turnIndicator = isCurrent ? '👉' : ''
    message += `${index + 1}. ${player.firstName} - **${player.hand?.length || 0}** cards ${turnIndicator}\n`
  })

  message += `\n🎙️ **Latest Action:**\n\n`

  // Last action performed
  if (game.lastActionMessage) {
    message += `${game.lastActionMessage}\n\n`
  }

  // Current game info
  message += `🃏 Top Card: **${formatCard(topCard)}**\n`
  if (game.chosenSymbol) {
    const symbolEmojis: Record<string, string> = {
      circle: '⚪',
      triangle: '🔺',
      cross: '✖️',
      square: '🟦',
      star: '⭐'
    }
    message += `🎯 Active Symbol: ${symbolEmojis[game.chosenSymbol]} ${game.chosenSymbol}\n`
  }
  message += `📦 Deck: **${game.deck?.length || 0}** cards left\n`
  message += `\n🎯 Turn: **${currentPlayer.firstName}**`

  return message
}
