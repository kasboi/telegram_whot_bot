# Game Rules Instructions - Telegram Whot

## Game Overview

Whot is a Nigerian card game similar to UNO. This bot implements two modes:

- **Classic Mode**: Traditional rules with deck reshuffling
- **Tender Mode**: When deck runs out, lowest hand value wins

## Game Actors

### Creator

- Initiates game with `/startgame` command
- Only player who can tap "Start Game" button
- Identified by Telegram `userId`
- Game cancels if creator leaves before starting

### Players

- Join via "Join Game" inline button in group chat
- Interact with game through private chat
- Receive personal card hands and action buttons

## Game Modes

### Classic Mode

- Turn-based clockwise play
- Match symbol or number, or play Whot
- Special cards apply their effects
- First player to empty hand wins
- Deck reshuffles when empty (using discard pile)
- 3+ players: winner continues, one loser eliminated per round

### Tender Mode

- Same as Classic initially
- When deck runs out: **Tender Phase** begins
- All hands revealed publicly
- Player with **lowest total card value** wins
- 3+ players: one elimination per round

## Card System

### Standard Cards

- **Symbols**: Circle, Triangle, Cross, Square, Star
- **Numbers**: 1-20 per symbol
- **Validation**: Play if matches top discard by symbol OR number

### Special Cards with Powers

| Card               | Number | Power                                                                 | Implementation Notes                                        |
| ------------------ | ------ | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Whot**           | 20     | Wild card - can be played on any card. Player must declare new symbol | Show symbol selection buttons in private chat               |
| **Pick Two**       | 2      | Next player draws 2 cards and skips turn. **Stackable**               | Can stack multiple Pick Twos - accumulate total draw amount |
| **Pick Three**     | 5      | Next player draws 3 cards and skips turn. **Stackable**               | Can stack with other Pick Threes                            |
| **Hold On**        | 1      | Current player gets another turn immediately                          | Keep turn with same player                                  |
| **General Market** | 14     | All OTHER players draw 1 card each                                    | Skip current player when distributing cards                 |
| **Suspension**     | 8      | Next player misses their turn completely                              | Advance turn counter by 2 positions                         |

### Special Card Stacking Rules

- **Pick Two (2)** and **Pick Three (5)** can stack with cards of same type
- Player can play another Pick Two on top of Pick Two to avoid drawing
- Total accumulates: 2+2+2 = 6 cards to draw for final player
- Stacking only works with same card type (can't mix Pick Two and Pick Three)

## Game State Transitions

```
idle → waiting_for_players → ready_to_start → in_progress → ended
                                                ↓
                                         player_turn ← (cycling)
                                                ↓
                                         tender_check (Tender mode only)
```

### State Descriptions

- **idle**: No active game in group
- **waiting_for_players**: Game created, accepting joins
- **ready_to_start**: Minimum players joined, creator can start
- **in_progress**: Active gameplay
- **player_turn**: Waiting for specific player action
- **tender_check**: Deck empty, calculating hand values
- **ended**: Game concluded, winner declared

## Player States

- **joined**: In lobby, game not started
- **active**: Currently playing
- **out**: Eliminated or finished playing
- **winner**: Won current round

## Turn Mechanics

### Valid Moves

1. **Play matching card**: Symbol OR number matches top discard
2. **Play Whot (20)**: Always valid, requires symbol declaration
3. **Draw card**: When no valid plays available
4. **Call Tender**: Only in Tender mode when available

### Turn Flow

1. Private chat shows current hand as buttons (only playable cards enabled)
2. Player selects card to play OR draws
3. Special card effects apply immediately
4. Turn advances to next player (unless Hold On played)
5. Group chat announces the play publicly

### Hand Value Calculation (Tender Mode)

- Sum all card numbers in hand
- Whot cards count as 20 points each
- Lowest total wins
- Ties handled by arbitrary selection (first player wins)

## Communication Patterns

### Group Chat Messages

- "Player X joined the game"
- "Player Y played Circle 5"
- "Player Z drew a card"
- "Deck reshuffled" (Classic mode)
- "Tender phase! Revealing hands..." (Tender mode)
- Winner announcements

### Private Chat Messages

- Current hand display (as inline keyboard)
- "Your turn" notifications
- Card play confirmations
- "Draw a card" button when no plays available
- Symbol selection for Whot cards
- "Call Tender" button (Tender mode)

## Minimum Viable Rules

### Phase 1 Implementation

- Support 2-6 players per game
- All special cards implemented
- Both Classic and Tender modes
- Basic win/elimination logic
- No tournament brackets or scoring

### Validation Requirements

- Verify card plays are legal (symbol/number match or Whot)
- Enforce turn order
- Apply special card effects correctly
- Handle deck exhaustion appropriately per mode
- Prevent invalid actions (playing out of turn, invalid cards)

## Edge Cases to Handle

- Creator leaves before game starts → cancel game
- Player leaves during game → continue without them
- Bot restart → all games reset
- Invalid card selections → ignore with error message
- Network issues during play → timeout handling
