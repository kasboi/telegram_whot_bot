import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { getGame, startGameWithCards, clearGame } from '../game/state.ts'
import { drawCard, selectWhotSymbol } from '../game/state.ts'
import { logger } from '../utils/logger.ts'
import { generateGroupStatusMessage } from '../handlers/updates.ts'
import { sendPlayerHand } from '../handlers/private.ts'

/**
 * Manages all game timeouts (lobby, turn, whot selection)
 */
export class TimeoutManager {
  private timers = new Map<string, number>()
  private bot: Bot

  constructor(bot: Bot) {
    this.bot = bot
  }

  /**
   * Start lobby timeout - 90 seconds to auto-start or cancel game
   */
  startLobbyTimeout(gameId: number): void {
    const timerKey = `lobby_${gameId}`

    // Cancel existing timer if any
    this.cancelTimer(timerKey)

    logger.info('Starting lobby timeout', {
      gameId,
      duration: '90 seconds',
      reminders: 'every 15 seconds'
    })

    // Schedule reminders every 15 seconds
    const reminderIntervals = [75, 60, 45, 30, 15] // seconds remaining

    reminderIntervals.forEach(secondsLeft => {
      const delay = (90 - secondsLeft) * 1000 // when to send reminder

      setTimeout(async () => {
        const game = getGame(gameId)
        if (!game || game.state !== 'waiting_for_players') return

        try {
          const playerCount = game.players.length
          const message =
            `⏰ **${secondsLeft} seconds remaining** to join the game!\n\n` +
            `👥 Current players: ${playerCount}\n` +
            `${game.players.map(p => `• ${p.firstName}`).join('\n')}\n\n` +
            `${playerCount >= 2 ? '✅ Game will auto-start when timer expires' : '❌ Need at least 2 players or game will be cancelled'}`

          await this.bot.api.sendMessage(gameId, message, { parse_mode: 'Markdown' })

          logger.debug('Lobby reminder sent', { gameId, secondsLeft, playerCount })
        } catch (error) {
          logger.warn('Failed to send lobby reminder', {
            gameId,
            secondsLeft,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }, delay)
    })

    // Set main timeout for 90 seconds
    const timeoutId = setTimeout(async () => {
      await this.handleLobbyTimeout(gameId)
      this.timers.delete(timerKey)
    }, 90000)

    this.timers.set(timerKey, timeoutId)
  }

  /**
   * Start turn timeout - 30 seconds to make a move or auto-draw
   */
  startTurnTimeout(gameId: number, playerId: number): void {
    const timerKey = `turn_${gameId}_${playerId}`

    // Cancel existing timer if any
    this.cancelTimer(timerKey)

    logger.debug('Starting turn timeout', {
      gameId,
      playerId,
      duration: '30 seconds'
    })

    const timeoutId = setTimeout(async () => {
      await this.handleTurnTimeout(gameId, playerId)
      this.timers.delete(timerKey)
    }, 30000)

    this.timers.set(timerKey, timeoutId)
  }

  /**
   * Start Whot symbol selection timeout - 15 seconds to choose or auto-select
   */
  startWhotTimeout(gameId: number, playerId: number): void {
    const timerKey = `whot_${gameId}_${playerId}`

    // Cancel existing timer if any
    this.cancelTimer(timerKey)

    logger.debug('Starting Whot selection timeout', {
      gameId,
      playerId,
      duration: '15 seconds'
    })

    const timeoutId = setTimeout(async () => {
      await this.handleWhotTimeout(gameId, playerId)
      this.timers.delete(timerKey)
    }, 15000)

    this.timers.set(timerKey, timeoutId)
  }

  /**
   * Cancel a specific timer
   */
  cancelTimer(timerKey: string): void {
    const timerId = this.timers.get(timerKey)
    if (timerId) {
      clearTimeout(timerId)
      this.timers.delete(timerKey)
      logger.debug('Timer cancelled', { timerKey })
    }
  }

  /**
   * Cancel all timers for a specific game
   */
  cancelAllTimers(gameId: number): void {
    const gameTimers = Array.from(this.timers.keys()).filter(key =>
      key.includes(`_${gameId}_`) || key.includes(`_${gameId}`)
    )

    gameTimers.forEach(timerKey => this.cancelTimer(timerKey))

    if (gameTimers.length > 0) {
      logger.info('All timers cancelled for game', { gameId, cancelledCount: gameTimers.length })
    }
  }

  /**
   * Cancel all timers (for bot shutdown/restart)
   */
  cancelAllActiveTimers(): void {
    const timerCount = this.timers.size
    this.timers.forEach((timerId, timerKey) => {
      clearTimeout(timerId)
    })
    this.timers.clear()

    if (timerCount > 0) {
      logger.info('All active timers cancelled', { timerCount })
    }
  }

  /**
   * Handle lobby timeout - auto-start or cancel game
   */
  private async handleLobbyTimeout(gameId: number): Promise<void> {
    try {
      const game = getGame(gameId)
      if (!game || game.state !== 'waiting_for_players') {
        logger.debug('Lobby timeout ignored - game not in waiting state', { gameId })
        return
      }

      const playerCount = game.players.length

      if (playerCount >= 2) {
        // Auto-start the game
        logger.info('Auto-starting game after lobby timeout', { gameId, playerCount })

        const success = startGameWithCards(gameId)
        if (success) {
          const startedGame = getGame(gameId)
          if (startedGame) {
            const message =
              '⏰ **Time\'s up! Game starting automatically...** ⏰\n\n' +
              generateGroupStatusMessage(startedGame)

            await this.bot.api.sendMessage(gameId, message, { parse_mode: 'Markdown' })

            // Send hands to all players
            for (const player of startedGame.players) {
              try {
                await sendPlayerHand(this.bot, gameId, player.id, player.firstName)
              } catch (error) {
                logger.warn('Failed to send hand after auto-start', {
                  gameId,
                  playerId: player.id,
                  error: error instanceof Error ? error.message : String(error)
                })
              }
            }

            // Start turn timeout for first player
            const currentPlayer = startedGame.players[startedGame.currentPlayerIndex!]
            this.startTurnTimeout(gameId, currentPlayer.id)
          }
        } else {
          await this.bot.api.sendMessage(gameId, '❌ Failed to auto-start game. Please try again manually.')
        }
      } else {
        // Cancel the game
        logger.info('Cancelling game after lobby timeout - insufficient players', { gameId, playerCount })

        clearGame(gameId)

        const message =
          '⏰ **Time\'s up!** ⏰\n\n' +
          '❌ **Game cancelled** - Not enough players joined.\n' +
          '👥 Minimum 2 players required to start.\n\n' +
          '🔄 Use /startgame to create a new game!'

        await this.bot.api.sendMessage(gameId, message, { parse_mode: 'Markdown' })
      }
    } catch (error) {
      logger.error('Error handling lobby timeout', {
        gameId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Handle turn timeout - auto-draw card or apply penalty
   */
  private async handleTurnTimeout(gameId: number, playerId: number): Promise<void> {
    try {
      const game = getGame(gameId)
      if (!game || game.state !== 'in_progress') {
        logger.debug('Turn timeout ignored - game not in progress', { gameId, playerId })
        return
      }

      const currentPlayer = game.players[game.currentPlayerIndex!]
      if (currentPlayer.id !== playerId) {
        logger.debug('Turn timeout ignored - not current player', { gameId, playerId, currentPlayerId: currentPlayer.id })
        return
      }

      logger.info('Handling turn timeout - auto-drawing for player', { gameId, playerId, playerName: currentPlayer.firstName })

      // Auto-draw card (this handles both normal draws and penalty effects)
      const result = drawCard(gameId, playerId)

      if (result.success) {
        const timeoutMessage =
          `⏰ **Time's up!** ${currentPlayer.firstName} took too long.\n` +
          `🤖 ${result.message}`

        await this.bot.api.sendMessage(gameId, timeoutMessage, { parse_mode: 'Markdown' })

        // Update all players' hands
        for (const player of game.players) {
          try {
            await sendPlayerHand(this.bot, gameId, player.id, player.firstName)
          } catch (error) {
            logger.warn('Failed to send hand after turn timeout', {
              gameId,
              playerId: player.id,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }

        // Start timeout for next player if game is still in progress
        const updatedGame = getGame(gameId)
        if (updatedGame && updatedGame.state === 'in_progress') {
          const nextPlayer = updatedGame.players[updatedGame.currentPlayerIndex!]
          this.startTurnTimeout(gameId, nextPlayer.id)
        }
      } else {
        logger.warn('Failed to auto-draw on turn timeout', { gameId, playerId, error: result.message })
      }
    } catch (error) {
      logger.error('Error handling turn timeout', {
        gameId,
        playerId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Handle Whot symbol selection timeout - auto-select random symbol
   */
  private async handleWhotTimeout(gameId: number, playerId: number): Promise<void> {
    try {
      const game = getGame(gameId)
      if (!game || game.state !== 'in_progress') {
        logger.debug('Whot timeout ignored - game not in progress', { gameId, playerId })
        return
      }

      // Auto-select random symbol
      const symbols = ['circle', 'triangle', 'square', 'star', 'cross']
      const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)]

      logger.info('Handling Whot timeout - auto-selecting symbol', { gameId, playerId, symbol: randomSymbol })

      const result = selectWhotSymbol(gameId, playerId, randomSymbol)

      if (result.success) {
        const symbolEmojis: Record<string, string> = {
          circle: '⚪',
          triangle: '🔺',
          square: '🟦',
          star: '⭐',
          cross: '❌'
        }

        const timeoutMessage =
          `⏰ **Time's up!** Auto-selected symbol.\n` +
          `🎯 **Chosen symbol:** ${symbolEmojis[randomSymbol]} ${randomSymbol}`

        await this.bot.api.sendMessage(gameId, timeoutMessage, { parse_mode: 'Markdown' })

        // Update all players' hands
        for (const player of game.players) {
          try {
            await sendPlayerHand(this.bot, gameId, player.id, player.firstName)
          } catch (error) {
            logger.warn('Failed to send hand after Whot timeout', {
              gameId,
              playerId: player.id,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }

        // Start timeout for next player
        const updatedGame = getGame(gameId)
        if (updatedGame && updatedGame.state === 'in_progress') {
          const nextPlayer = updatedGame.players[updatedGame.currentPlayerIndex!]
          this.startTurnTimeout(gameId, nextPlayer.id)
        }
      } else {
        logger.warn('Failed to auto-select Whot symbol on timeout', { gameId, playerId, error: result.message })
      }
    } catch (error) {
      logger.error('Error handling Whot timeout', {
        gameId,
        playerId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Get debug info about active timers
   */
  getActiveTimers(): { timerKey: string, type: string, gameId: string }[] {
    return Array.from(this.timers.keys()).map(timerKey => {
      const parts = timerKey.split('_')
      return {
        timerKey,
        type: parts[0],
        gameId: parts[1]
      }
    })
  }
}

// Global timeout manager instance
let timeoutManager: TimeoutManager | null = null

/**
 * Initialize the timeout manager with bot instance
 */
export function initTimeoutManager(bot: Bot): void {
  if (timeoutManager) {
    // Cancel existing timers before creating new manager
    timeoutManager.cancelAllActiveTimers()
  }
  timeoutManager = new TimeoutManager(bot)
  logger.info('Timeout manager initialized')
}

/**
 * Get the global timeout manager instance
 */
export function getTimeoutManager(): TimeoutManager {
  if (!timeoutManager) {
    throw new Error('Timeout manager not initialized. Call initTimeoutManager() first.')
  }
  return timeoutManager
}
