// Basic game types
export type GameState =
  | 'idle'
  | 'waiting_for_players'
  | 'ready_to_start'
  | 'in_progress'
  | 'ended'

export type PlayerState =
  | 'joined'
  | 'active'
  | 'out'
  | 'winner'

export type WhotSymbol = 'circle' | 'triangle' | 'cross' | 'square' | 'whot'

export interface Card {
  id: string
  symbol: WhotSymbol
  number: number
  isSpecial: boolean
}

export interface Player {
  id: number        // Telegram user ID
  firstName: string // Telegram first name
  state: PlayerState
  hand?: Card[]     // Player's cards (Stage 2+)
}

export interface GameSession {
  id: number           // Group chat ID
  state: GameState
  creatorId: number    // Creator's Telegram user ID
  players: Player[]
  createdAt: Date
  
  // Stage 2: Game mechanics
  deck?: Card[]        // Draw pile
  discardPile?: Card[] // Discard pile
  currentPlayerIndex?: number // Whose turn it is
  direction?: 'clockwise' | 'counterclockwise' // Turn direction
}
