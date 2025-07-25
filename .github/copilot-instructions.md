# Copilot Instructions - Telegram Whot Game Bot

## Architecture Overview

Multiplayer Whot card game bot using **dual chat pattern**: group chats for public coordination, private chats for individual gameplay.

**Tech Stack:** Deno + TypeScript + grammY framework  
**State:** In-memory game sessions keyed by `groupChatId` (no persistence)

## Development Methodology

⚠️ **Build incrementally - DO NOT implement everything at once**

### Stage-by-Stage Development:

1. **Foundation**: Basic bot setup + `/startgame` command
2. **Core Game**: Card deck, basic game state, simple card play
3. **Special Cards**: Whot, Pick Two, Hold On mechanics
4. **Polish**: Error handling, edge cases, UX improvements

### Git Workflow:

- **One feature per commit** with clear commit messages
- **Test each stage** before moving to next
- **Ask for confirmation** before proceeding to next stage
- Use commit format: `feat: implement basic card deck system`

## Core Implementation Patterns

### Message Routing

- **Group chat**: `/startgame`, join buttons, turn announcements
- **Private chat**: card hands, play/draw actions, only show valid moves
- **Creator-only permissions** for game start

### Game State Flow

`idle` → `waiting_for_players` → `ready_to_start` → `in_progress` → `ended`

### Key Code Patterns

```typescript
// Game state access
const game = gameState.get(ctx.chat.id);

// Dual chat messaging
if (ctx.chat.type === "group") {
  /* public updates */
} else {
  /* private card actions */
}

// grammY inline keyboards
const keyboard = new InlineKeyboard().text("Join Game", `join_${groupChatId}`);
```

## Project Structure

```
src/
├── bot.ts           # Main entry + grammY setup
├── game/            # Game logic (state.ts, cards.ts, engine.ts)
├── handlers/        # Message handlers (commands.ts, callbacks.ts)
└── types/           # TypeScript interfaces
```

## Development

```bash
deno run --allow-net --allow-env bot.ts
```

## Reference Files

- `.github/instructions/game-rules.instructions.md`: Complete Whot rules and special cards
- `.github/instructions/technical-patterns.instructions.md`: Detailed implementation patterns

## Critical Domain Rules

- **Special cards**: Whot(20)=wild, Pick Two(2)=stackable, Hold On(1)=extra turn
- **Two modes**: Classic (deck reshuffling) vs Tender (lowest hand wins)
- **Validation**: match symbol OR number, or play Whot
