import { GameSession } from "../types/game.ts";
import { GameStore, PersistenceResult } from "./types.ts";
import { logger } from "../utils/logger.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

const DB_PATH = "./data";

export class JSONGameStore implements GameStore {
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string = DB_PATH) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await ensureDir(this.dbPath);
      this.initialized = true;
      logger.info(`JSON store initialized at ${this.dbPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to initialize JSON store: ${message}`);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("JSON store not initialized. Call init() first.");
    }
  }

  private getGamePath(groupChatId: number): string {
    return `${this.dbPath}/${groupChatId}.json`;
  }

  async saveGame(game: GameSession): Promise<void> {
    this.ensureInitialized();
    try {
      const filePath = this.getGamePath(game.id);
      const json = JSON.stringify(game, null, 2);
      await Deno.writeTextFile(filePath, json);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to save game ${game.id}: ${message}`);
      throw error;
    }
  }

  async loadGame(groupChatId: number): Promise<GameSession | null> {
    this.ensureInitialized();
    try {
      const filePath = this.getGamePath(groupChatId);
      const json = await Deno.readTextFile(filePath);
      return JSON.parse(json) as GameSession;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to load game ${groupChatId}: ${message}`);
      throw error;
    }
  }

  async deleteGame(groupChatId: number): Promise<void> {
    this.ensureInitialized();
    try {
      const filePath = this.getGamePath(groupChatId);
      await Deno.remove(filePath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return; // Already deleted
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to delete game ${groupChatId}: ${message}`);
      throw error;
    }
  }

  async listActiveGames(): Promise<number[]> {
    this.ensureInitialized();
    const activeGames: number[] = [];
    try {
      for await (const dirEntry of Deno.readDir(this.dbPath)) {
        if (dirEntry.isFile && dirEntry.name.endsWith(".json")) {
          const gameId = parseInt(dirEntry.name.replace(".json", ""), 10);
          const game = await this.loadGame(gameId);
          if (game && game.state !== "ended") {
            activeGames.push(game.id);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to list active games: ${message}`);
    }
    return activeGames;
  }

  async getPlayerGames(userId: number): Promise<GameSession[]> {
    this.ensureInitialized();
    const playerGames: GameSession[] = [];
    try {
      for await (const dirEntry of Deno.readDir(this.dbPath)) {
        if (dirEntry.isFile && dirEntry.name.endsWith(".json")) {
          const gameId = parseInt(dirEntry.name.replace(".json", ""), 10);
          const game = await this.loadGame(gameId);
          if (game && game.players.some((p) => p.id === userId)) {
            playerGames.push(game);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to get player games for ${userId}: ${message}`);
    }
    return playerGames;
  }
  
  async close(): Promise<void> {
    this.initialized = false;
    logger.info("JSON store closed.");
    return Promise.resolve();
  }

  async healthCheck(): Promise<PersistenceResult> {
    try {
      const testPath = `${this.dbPath}/.healthcheck`;
      await Deno.writeTextFile(testPath, "ok");
      await Deno.remove(testPath);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }
}
