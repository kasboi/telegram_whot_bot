import { assertEquals, assertNotEquals, assertExists } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.177.0/testing/bdd.ts";
import { GameSession, Card } from "../src/types/game.ts";
import { createGame, addPlayer, startGameWithCards, drawCard, getGame, clearGame } from "../src/game/state.ts";

describe("End Game Scenarios", () => {
  let game: GameSession | undefined;
  const groupChatId = -1001234567890;
  const player1 = { id: 1, firstName: "Player 1" };
  const player2 = { id: 2, firstName: "Player 2" };

  beforeEach(() => {
    createGame(groupChatId, player1.id, player1.firstName);
    addPlayer(groupChatId, player1.id, player1.firstName);
    addPlayer(groupChatId, player2.id, player2.firstName);
    startGameWithCards(groupChatId);
    game = getGame(groupChatId);
    assertExists(game);
    // Add some cards to the discard pile for reshuffling
    game.discardPile = [
        ...game.discardPile || [],
        { id: 'circle_1', symbol: 'circle', number: 1, isSpecial: false },
        { id: 'circle_2', symbol: 'circle', number: 2, isSpecial: true },
        { id: 'triangle_3', symbol: 'triangle', number: 3, isSpecial: false },
    ];
  });

  afterEach(() => {
    clearGame(groupChatId);
    game = undefined;
  });

  it("should end the game and declare a winner when the deck runs out twice", () => {
    assertExists(game);

    // Simulate the deck running out for the first time
    game.deck = [];

    // It's player 1's turn, they draw, which triggers a reshuffle
    let result = drawCard(groupChatId, player1.id);
    assertEquals(result.reshuffled, true);
    assertEquals(game.reshuffleCount, 1);
    assertNotEquals(game.deck?.length, 0);

    // Simulate the deck running out for the second time
    game.deck = [];

    // It's now player 2's turn, they attempt to draw
    const result2 = drawCard(groupChatId, player2.id);

    // Assert that the game has ended
    assertEquals(result2.gameEnded, true);
    assertEquals(game.state, 'ended');

    // Assert that a winner has been declared
    assertExists(game.winner);
    assertExists(result2.tenderResult);
    assertEquals(result2.tenderResult?.winner.id, game.winner.id);
  });
});
