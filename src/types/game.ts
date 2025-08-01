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

export type WhotSymbol = 'circle' | 'triangle' | 'cross' | 'square' | 'star' | 'whot'

export interface Card {
  id: string
  symbol: WhotSymbol
  number: number
  isSpecial: boolean
}

export interface Player {
  id: number        // Telegram user ID
  firstName: string // Telegram first name
  username?: string // Telegram username
  state: PlayerState
  hand?: Card[]     // Player's cards (Stage 2+)
  cardsPlayedCount?: number
  specialCardsPlayedCount?: number
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
  playedCards?: Card[] // All played cards
  lastPlayedCard?: Card // Current top card
  currentPlayerIndex?: number // Whose turn it is
  direction?: 'clockwise' | 'counterclockwise' // Turn direction

  // Stage 3: Special card effects
  pendingEffect?: {
    type: 'pick_cards' | 'skip_turn' | 'general_market'
    amount: number
    targetPlayerIndex?: number // Player index who must pick cards
    stackCount?: number   // For stacking Pick Two/Three cards
    cardType?: number     // Card number that initiated the effect (2 for Pick Two, 5 for Pick Three)
  }
  chosenSymbol?: string // For Whot card symbol selection
  winner?: Player      // Game winner
  lastActionMessage?: string // Latest game action announcement for private chats
  lastActionTime?: Date // Last time any game action occurred (for cleanup)
  reshuffleCount: number // Number of times deck has been reshuffled (0 = not reshuffled, 1 = reshuffled once)
  suddenDeath: boolean // True when deck exhausted twice - no more drawing allowed
  isSimulation?: boolean
}
