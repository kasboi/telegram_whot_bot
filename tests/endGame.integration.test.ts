import { assertEquals, assertExists, assert } from "https://deno.land/std@0.177.0/testing/asserts.ts"
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.177.0/testing/bdd.ts"
import { GameSession } from "../src/types/game.ts"
import { createGame, addPlayer, startGameWithCards, drawCard, getGame, clearGame } from "../src/game/state.ts"

describe("End Game Scenarios", () => {
  let game: GameSession | undefined
  const groupChatId = -1001234567890
  const player1 = { id: 1, firstName: "Player 1" }
  const player2 = { id: 2, firstName: "Player 2" }

  beforeEach(() => {
    createGame(groupChatId, player1.id, player1.firstName)
    addPlayer(groupChatId, player1.id, player1.firstName)
    addPlayer(groupChatId, player2.id, player2.firstName)
    startGameWithCards(groupChatId)
    game = getGame(groupChatId)
    assertExists(game)
    // Add some cards to the discard pile for reshuffling
    game.discardPile = [
      ...game.discardPile || [],
      { id: 'circle_1', symbol: 'circle', number: 1, isSpecial: false },
      { id: 'circle_2', symbol: 'circle', number: 2, isSpecial: true },
      { id: 'triangle_3', symbol: 'triangle', number: 3, isSpecial: false },
    ]
  })

  afterEach(() => {
    clearGame(groupChatId)
    game = undefined
  })

  it("should end the game and declare a winner when the deck runs out (tender-only mode)", () => {
    assertExists(game)

    // Simulate the deck running out - should trigger immediate tender mode
    game.deck = []

    // It's player 1's turn, they draw, which triggers tender mode immediately
    const result = drawCard(groupChatId, player1.id)

    // Assert that the game has ended immediately (no reshuffling)
    assertEquals(result.gameEnded, true)
    assertEquals(game.state, 'ended')

    // Assert that a winner has been declared or there's a tie
    assertExists(result.tenderResult)

    if (result.tenderResult.tie) {
      // In case of tie
      assertExists(result.tenderResult.tiedPlayers)
      assert(result.tenderResult.tiedPlayers.length > 1)
    } else {
      // In case of single winner
      assertExists(result.tenderResult.winner)
      assertExists(game.winner)
      assertEquals(result.tenderResult.winner.id, game.winner.id)
    }
  })
})
