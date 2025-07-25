// Basic game types for Stage 1
export type GameState = 
  | 'idle'
  | 'waiting_for_players' 
  | 'ready_to_start'
  | 'in_progress'
  | 'ended';

export type PlayerState = 
  | 'joined' 
  | 'active' 
  | 'out' 
  | 'winner';

export interface Player {
  id: number;        // Telegram user ID
  firstName: string; // Telegram first name
  state: PlayerState;
}

export interface GameSession {
  id: number;           // Group chat ID
  state: GameState;
  creatorId: number;    // Creator's Telegram user ID
  players: Player[];
  createdAt: Date;
}
