import { Card, GameSession, WhotSymbol } from "../types/game.ts"
import { logger } from "../utils/logger.ts"
import { MyContext } from "../bot.ts"
import { createDeck, shuffleDeck } from "./cards.ts"

/**
 * Session-based game state management
 * Replaces the old KV-based persistence system
 */

export function getGame(ctx: MyContext): GameSession | undefined {
  return ctx.session.game
}

export function setGame(ctx: MyContext, game: GameSession): void {
  ctx.session.game = game
  logger.debug("Game saved to session", {
    groupChatId: game.id,
    state: game.state,
    playerCount: game.players.length,
  })
}

export function clearGame(ctx: MyContext): void {
  ctx.session.game = undefined
  logger.debug("Game cleared from session", {
    groupChatId: ctx.chat?.id,
  })
}

export function hasGame(ctx: MyContext): boolean {
  return !!ctx.session.game
}

export function updateGame(
  ctx: MyContext,
  updater: (game: GameSession) => GameSession,
): boolean {
  const game = getGame(ctx)
  if (!game) {
    return false
  }

  const updatedGame = updater(game)
  setGame(ctx, updatedGame)
  return true
}

/**
 * Get game with validation
 */
export function getGameOrThrow(ctx: MyContext): GameSession {
  const game = getGame(ctx)
  if (!game) {
    throw new Error("No active game in this chat")
  }
  return game
}

/**
 * Initialize a new game session
 */
export function createNewGame(
  groupChatId: number,
  creatorId: number,
  creatorName: string,
): GameSession {
  const newGame: GameSession = {
    id: groupChatId,
    state: "waiting_for_players",
    creatorId: creatorId,
    players: [{
      id: creatorId,
      firstName: creatorName,
      state: "joined",
      cards: [],
      isConnected: true,
    }],
    maxPlayers: 8,
    minPlayers: 2,
    createdAt: new Date(),
    deck: [],
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    lastActivity: new Date(),
    reshuffleCount: 0,
    suddenDeath: false,
  }

  return newGame
}

/**
 * Utility functions for common game state operations
 */
export function addPlayerToGame(
  ctx: MyContext,
  playerId: number,
  playerName: string,
): boolean {
  return updateGame(ctx, (game) => {
    // Check if player already exists
    const existingPlayer = game.players.find((p) => p.id === playerId)
    if (existingPlayer) {
      // Update connection status
      existingPlayer.isConnected = true
      return game
    }

    // Add new player
    if (game.players.length >= game.maxPlayers) {
      throw new Error("Game is full")
    }

    game.players.push({
      id: playerId,
      firstName: playerName,
      state: "joined",
      cards: [],
      isConnected: true,
    })

    return game
  })
}

export function removePlayerFromGame(
  ctx: MyContext,
  playerId: number,
): boolean {
  return updateGame(ctx, (game) => {
    game.players = game.players.filter((p) => p.id !== playerId)

    // Adjust current player index if necessary
    if (game.currentPlayerIndex! >= game.players.length) {
      game.currentPlayerIndex = 0
    }

    return game
  })
}

export function getCurrentPlayer(
  ctx: MyContext,
):
  | { id: number; firstName: string; cards: Card[]; isConnected: boolean }
  | undefined {
  const game = getGame(ctx)
  if (!game || game.players.length === 0) {
    return undefined
  }

  return game.players[game.currentPlayerIndex!]
}

export function advanceToNextPlayer(ctx: MyContext): void {
  const game = getGame(ctx)
  if (!game) return

  game.currentPlayerIndex =
    (game.currentPlayerIndex! + game.direction! + game.players.length) %
    game.players.length
  game.lastActivity = new Date()
  setGame(ctx, game)
}

/**
 * Game state validation
 */
export function validateGameState(game: GameSession): boolean {
  try {
    // Basic validation
    if (!game.id || !game.players || game.players.length === 0) {
      return false
    }

    if (
      game.currentPlayerIndex! < 0 ||
      game.currentPlayerIndex! >= game.players.length
    ) {
      return false
    }

    if (
      !["waiting_for_players", "ready_to_start", "in_progress", "ended"]
        .includes(game.state)
    ) {
      return false
    }

    return true
  } catch (error) {
    logger.error("Game state validation failed", {
      error: error instanceof Error ? error.message : String(error),
      gameId: game.id,
    })
    return false
  }
}

/**
 * Session storage health check
 */
export function sessionHealthCheck(): { success: boolean; message: string } {
  try {
    // Sessions are handled by grammY, so this is always available
    return {
      success: true,
      message: "Session storage is operational (grammY free storage)",
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Start a game with cards dealt to all players
 */
export function startGameWithCards(ctx: MyContext): boolean {
  try {
    const game = getGame(ctx)
    if (!game) {
      logger.error("Cannot start game - no game found in session")
      return false
    }

    if (game.state !== "ready_to_start") {
      logger.error("Cannot start game - game not ready", { state: game.state })
      return false
    }

    if (game.players.length < game.minPlayers) {
      logger.error("Cannot start game - not enough players", {
        playerCount: game.players.length,
        minPlayers: game.minPlayers,
      })
      return false
    }

    // Create and shuffle deck
    const deck = shuffleDeck(createDeck())

    // Deal cards to players (5 cards each)
    const cardsPerPlayer = 5
    let currentCardIndex = 0

    for (const player of game.players) {
      player.cards = deck.slice(
        currentCardIndex,
        currentCardIndex + cardsPerPlayer,
      )
      currentCardIndex += cardsPerPlayer
    }

    // Remaining cards become the deck
    const remainingDeck = deck.slice(currentCardIndex)

    // First card of remaining deck goes to discard pile
    const firstDiscardCard = remainingDeck.shift()!

    // Update game state
    const updatedGame = {
      ...game,
      state: "in_progress" as const,
      deck: remainingDeck,
      discardPile: [firstDiscardCard],
      currentPlayerIndex: 0,
      lastActivity: new Date(),
    }

    setGame(ctx, updatedGame)

    logger.info("Game started with cards dealt", {
      groupChatId: game.id,
      playerCount: game.players.length,
      deckSize: remainingDeck.length,
      discardPileSize: 1,
    })

    return true
  } catch (error) {
    logger.error("Failed to start game with cards", {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Check if a game can be started
 */
export function canStartGame(ctx: MyContext): boolean {
  const game = getGame(ctx)
  if (!game) return false

  return game.state === "ready_to_start" &&
    game.players.length >= game.minPlayers
}

/**
 * Game utility functions for session-based storage
 */

export function getTopCard(ctx: MyContext): Card | null {
  const game = getGame(ctx)
  if (!game || !game.discardPile || game.discardPile.length === 0) {
    return null
  }
  return game.discardPile[game.discardPile.length - 1]
}

export function playCard(
  ctx: MyContext,
  playerId: number,
  cardIndex: number,
): boolean {
  return updateGame(ctx, (game) => {
    const player = game.players.find((p) => p.id === playerId)
    if (!player || cardIndex < 0 || cardIndex >= player.cards.length) {
      throw new Error("Invalid player or card index")
    }

    if (game.currentPlayerIndex !== game.players.indexOf(player)) {
      throw new Error("Not player's turn")
    }

    const card = player.cards[cardIndex]
    const topCard = game.discardPile![game.discardPile!.length - 1]

    // Validate card play (simplified validation)
    if (
      card.symbol !== topCard.symbol && card.number !== topCard.number &&
      card.number !== 20
    ) {
      throw new Error("Invalid card play")
    }

    // Remove card from player's hand
    player.cards.splice(cardIndex, 1)

    // Add card to discard pile
    game.discardPile!.push(card)

    // Update game state
    game.lastActivity = new Date()

    // Check for win condition
    if (player.cards.length === 0) {
      game.state = "ended"
      return game
    }

    // Advance to next player (unless it's a special card)
    if (card.number !== 1) { // 1 = Hold On
      game.currentPlayerIndex =
        (game.currentPlayerIndex! + game.direction! + game.players.length) %
        game.players.length
    }

    return game
  })
}

export function drawCard(ctx: MyContext, playerId: number): boolean {
  return updateGame(ctx, (game) => {
    const player = game.players.find((p) => p.id === playerId)
    if (!player) {
      throw new Error("Player not found")
    }

    if (game.currentPlayerIndex !== game.players.indexOf(player)) {
      throw new Error("Not player's turn")
    }

    if (game.deck!.length === 0) {
      throw new Error("Deck is empty")
    }

    // Draw card from deck
    const drawnCard = game.deck!.pop()!
    player.cards.push(drawnCard)

    // Advance to next player
    game.currentPlayerIndex =
      (game.currentPlayerIndex! + game.direction! + game.players.length) %
      game.players.length
    game.lastActivity = new Date()

    return game
  })
}

export function selectWhotSymbol(
  ctx: MyContext,
  playerId: number,
  symbol: string,
): boolean {
  return updateGame(ctx, (game) => {
    const player = game.players.find((p) => p.id === playerId)
    if (!player) {
      throw new Error("Player not found")
    }

    // Update the last played card's symbol (for Whot cards)
    const topCard = game.discardPile![game.discardPile!.length - 1]
    if (topCard.number === 20) {
      topCard.symbol = symbol as WhotSymbol
    }

    return game
  })
}
