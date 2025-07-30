import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { JSONGameStore } from "./jsonStore.ts";
import { GameSession, Player, PlayerState } from "../types/game.ts";

const TEST_DB_PATH = "./test_data";

async function setup(): Promise<JSONGameStore> {
  await Deno.mkdir(TEST_DB_PATH, { recursive: true });
  const store = new JSONGameStore(TEST_DB_PATH);
  await store.init();
  return store;
}

async function teardown() {
  try {
    await Deno.remove(TEST_DB_PATH, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

function createDummyGame(id: number, state: GameSession["state"], players: Player[]): GameSession {
    return {
      id,
      state,
      players,
      creatorId: players[0]?.id || 1,
      deck: [],
      playedCards: [],
      currentPlayerIndex: 0,
      createdAt: new Date(),
      maxPlayers: 4,
      minPlayers: 2,
      reshuffleCount: 0,
      suddenDeath: false,
    };
  }

Deno.test("JSONGameStore - Initialization", async (t) => {
  await t.step("should create the db path", async () => {
    const store = await setup();
    const stats = await Deno.stat(TEST_DB_PATH);
    assert(stats.isDirectory);
    await teardown();
  });
});

Deno.test("JSONGameStore - Save and Load Game", async (t) => {
  const store = await setup();
  await t.step("should save and load a game", async () => {
    const players: Player[] = [{ id: 1, firstName: "Player 1", cards: [], state: "active", isConnected: true, username: "p1" }];
    const game = createDummyGame(123, "in_progress", players);
  
    await store.saveGame(game);
    const loadedGame = await store.loadGame(123);
  
    assertExists(loadedGame);
    assertEquals(loadedGame.id, game.id);
    assertEquals(loadedGame.players[0].firstName, "Player 1");
  });
  await teardown();
});

Deno.test("JSONGameStore - Delete Game", async (t) => {
    const store = await setup();
    await t.step("should delete a game", async () => {
        const players: Player[] = [{ id: 1, firstName: "Player 1", cards: [], state: "active", isConnected: true, username: "p1" }];
        const game = createDummyGame(456, "in_progress", players);
      
        await store.saveGame(game);
        let loadedGame = await store.loadGame(456);
        assertExists(loadedGame);
      
        await store.deleteGame(456);
        loadedGame = await store.loadGame(456);
        assertEquals(loadedGame, null);
    });
    await teardown();
  });
  
  Deno.test("JSONGameStore - List Active Games", async (t) => {
    const store = await setup();
    await t.step("should list active games", async () => {
        const game1 = createDummyGame(1, "in_progress", []);
        const game2 = createDummyGame(2, "ended", []);
        const game3 = createDummyGame(3, "waiting_for_players", []);
      
        await store.saveGame(game1);
        await store.saveGame(game2);
        await store.saveGame(game3);
      
        const activeGames = await store.listActiveGames();
        assertEquals(activeGames.length, 2);
        assert(activeGames.includes(1));
        assert(activeGames.includes(3));
    });
    await teardown();
  });
  
  Deno.test("JSONGameStore - Get Player Games", async (t) => {
    const store = await setup();
    await t.step("should get player games", async () => {
        const player1: Player = { id: 1, firstName: "A", cards: [], state: "active", isConnected: true, username: "a" };
        const player2: Player = { id: 2, firstName: "B", cards: [], state: "active", isConnected: true, username: "b" };
    
        const game1 = createDummyGame(101, "in_progress", [player1]);
        const game2 = createDummyGame(102, "in_progress", [player2]);
        const game3 = createDummyGame(103, "in_progress", [player1]);
      
        await store.saveGame(game1);
        await store.saveGame(game2);
        await store.saveGame(game3);
      
        const player1Games = await store.getPlayerGames(1);
        assertEquals(player1Games.length, 2);
        assertEquals(player1Games.map(g => g.id).sort(), [101, 103]);
      
        const player2Games = await store.getPlayerGames(2);
        assertEquals(player2Games.length, 1);
        assertEquals(player2Games[0].id, 102);
    });
    await teardown();
  });