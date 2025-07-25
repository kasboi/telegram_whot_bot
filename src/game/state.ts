import { GameSession, GameState, Player } from '../types/game.ts';

// Global game state storage (in-memory for MVP)
export const gameState = new Map<number, GameSession>();

export function createGame(groupChatId: number, creatorId: number, creatorName: string): GameSession {
  const newGame: GameSession = {
    id: groupChatId,
    state: 'waiting_for_players',
    creatorId,
    players: [],
    createdAt: new Date()
  };
  
  gameState.set(groupChatId, newGame);
  return newGame;
}

export function getGame(groupChatId: number): GameSession | undefined {
  return gameState.get(groupChatId);
}

export function addPlayer(groupChatId: number, userId: number, firstName: string): boolean {
  const game = gameState.get(groupChatId);
  if (!game || game.state !== 'waiting_for_players') {
    return false;
  }
  
  // Check if player already joined
  if (game.players.some(p => p.id === userId)) {
    return false;
  }
  
  const newPlayer: Player = {
    id: userId,
    firstName,
    state: 'joined'
  };
  
  game.players.push(newPlayer);
  
  // Game ready to start if we have 2+ players
  if (game.players.length >= 2) {
    game.state = 'ready_to_start';
  }
  
  return true;
}

export function canStartGame(groupChatId: number, userId: number): boolean {
  const game = gameState.get(groupChatId);
  return game !== undefined && 
         game.state === 'ready_to_start' && 
         game.creatorId === userId && 
         game.players.length >= 2;
}
