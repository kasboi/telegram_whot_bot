# Technical Patterns Instructions - Telegram Whot

## grammY Framework Patterns

### Bot Setup and Initialization

```typescript
import {
  Bot,
  InlineKeyboard,
  Context,
} from "https://deno.land/x/grammy/mod.ts";

const bot = new Bot(Deno.env.get("TELEGRAM_BOT_TOKEN")!);

// Custom context type with game state
interface GameContext extends Context {
  gameState?: GameSession;
}

// Middleware to attach game state
bot.use(async (ctx, next) => {
  if (ctx.chat?.id) {
    ctx.gameState = gameState.get(ctx.chat.id);
  }
  await next();
});
```

### Command Handling Patterns

```typescript
// Creator-only command restriction
bot.command("startgame", async (ctx) => {
  if (ctx.chat?.type !== "group") {
    return ctx.reply("This command only works in group chats");
  }

  const existingGame = gameState.get(ctx.chat.id);
  if (existingGame) {
    return ctx.reply("A game is already active in this group");
  }

  // Create new game session
  const newGame: GameSession = {
    groupChatId: ctx.chat.id,
    creatorId: ctx.from!.id,
    state: "waiting_for_players",
    players: [],
    deck: generateShuffledDeck(),
    discardPile: [],
    currentPlayerIndex: 0,
  };

  gameState.set(ctx.chat.id, newGame);

  const keyboard = new InlineKeyboard().text(
    "Join Game",
    `join_${ctx.chat.id}`,
  );

  await ctx.reply("Whot game started! Click below to join:", {
    reply_markup: keyboard,
  });
});
```

### Inline Keyboard Patterns

```typescript
// Dynamic card hand keyboard
function createHandKeyboard(hand: Card[], validCards: Card[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  hand.forEach((card, index) => {
    const isValid = validCards.some(
      (valid) => valid.symbol === card.symbol && valid.number === card.number,
    );

    if (isValid) {
      keyboard.text(
        `${card.symbol} ${card.number}`,
        `play_${card.symbol}_${card.number}`,
      );
    } else {
      keyboard.text(`${card.symbol} ${card.number} ❌`, "invalid_card");
    }

    // New row every 3 cards
    if ((index + 1) % 3 === 0) keyboard.row();
  });

  // Add draw button if no valid plays
  if (validCards.length === 0) {
    keyboard.row().text("Draw Card 🎴", "draw_card");
  }

  return keyboard;
}

// Symbol selection for Whot cards
function createSymbolKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⭕ Circle", "symbol_circle")
    .text("🔺 Triangle", "symbol_triangle")
    .row()
    .text("❌ Cross", "symbol_cross")
    .text("⬜ Square", "symbol_square")
    .row()
    .text("⭐ Star", "symbol_star");
}
```

### Callback Query Handling

```typescript
// Pattern for handling button clicks
bot.callbackQuery(/^join_(\d+)$/, async (ctx) => {
  const groupChatId = parseInt(ctx.match[1]);
  const game = gameState.get(groupChatId);

  if (!game || game.state !== "waiting_for_players") {
    return ctx.answerCallbackQuery("Game is not accepting players");
  }

  const playerId = ctx.from.id;
  const playerExists = game.players.some((p) => p.id === playerId);

  if (playerExists) {
    return ctx.answerCallbackQuery("You're already in this game");
  }

  // Add player to game
  game.players.push({
    id: playerId,
    username: ctx.from.username || ctx.from.first_name,
    hand: [],
    state: "joined",
  });

  // Update game state if ready
  if (game.players.length >= 2) {
    game.state = "ready_to_start";

    // Add start button for creator only
    const keyboard = new InlineKeyboard()
      .text("Join Game", `join_${groupChatId}`)
      .row()
      .text("Start Game", `start_${groupChatId}`);

    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  }

  await ctx.answerCallbackQuery("You joined the game!");
  await ctx.api.sendMessage(
    groupChatId,
    `${ctx.from.first_name} joined the game! (${game.players.length} players)`,
  );
});

// Card play callback pattern
bot.callbackQuery(/^play_(\w+)_(\d+)$/, async (ctx) => {
  const symbol = ctx.match[1] as CardSymbol;
  const number = parseInt(ctx.match[2]);

  const game = findPlayerGame(ctx.from.id);
  if (!game || !isPlayerTurn(game, ctx.from.id)) {
    return ctx.answerCallbackQuery("It's not your turn");
  }

  const playedCard = { symbol, number };
  const success = playCard(game, ctx.from.id, playedCard);

  if (success) {
    await ctx.answerCallbackQuery(`Played ${symbol} ${number}`);
    await updateGameState(game);
  } else {
    await ctx.answerCallbackQuery("Invalid card play");
  }
});
```

### Dual Chat Messaging Patterns

```typescript
// Send private hand to player
async function sendPrivateHand(bot: Bot, player: Player, game: GameSession) {
  const validCards = getValidCards(player.hand, game.discardPile[0]);
  const keyboard = createHandKeyboard(player.hand, validCards);

  const handText =
    `Your hand (${player.hand.length} cards):\n` +
    player.hand.map((card) => `${card.symbol} ${card.number}`).join(", ");

  await bot.api.sendMessage(player.id, handText, {
    reply_markup: keyboard,
  });
}

// Public group announcement
async function announceCardPlay(
  bot: Bot,
  game: GameSession,
  player: Player,
  card: Card,
) {
  const message = `${player.username} played ${card.symbol} ${card.number}`;

  await bot.api.sendMessage(game.groupChatId, message);

  // Handle special card announcements
  if (card.number === 2) {
    await bot.api.sendMessage(
      game.groupChatId,
      "Next player must pick 2 cards! 🎴🎴",
    );
  }
}
```

### Game State Management Patterns

```typescript
// Global state storage
const gameState = new Map<number, GameSession>();

// Find game by player ID (for private chat context)
function findPlayerGame(playerId: number): GameSession | undefined {
  for (const [_, game] of gameState) {
    if (game.players.some((p) => p.id === playerId)) {
      return game;
    }
  }
  return undefined;
}

// State transition helpers
function transitionGameState(game: GameSession, newState: GameState) {
  game.state = newState;

  // Trigger side effects based on state change
  switch (newState) {
    case "in_progress":
      dealInitialHands(game);
      break;
    case "tender_check":
      calculateTenderWinner(game);
      break;
    case "ended":
      cleanupGame(game);
      break;
  }
}
```

### Card Game Logic Patterns

```typescript
// Card validation
function isValidPlay(card: Card, topDiscard: Card): boolean {
  return (
    card.symbol === topDiscard.symbol ||
    card.number === topDiscard.number ||
    card.number === 20
  ); // Whot is always valid
}

// Special card effects
function applyCardEffect(game: GameSession, card: Card, playerId: number) {
  switch (card.number) {
    case 1: // Hold On
      // Don't advance turn
      break;

    case 2: // Pick Two
      if (!handleStackableCard(game, card)) {
        const nextPlayer = getNextPlayer(game);
        drawCards(nextPlayer, 2);
        advanceTurn(game, 2); // Skip next player
      }
      break;

    case 8: // Suspension
      advanceTurn(game, 2); // Skip next player
      break;

    case 14: // General Market
      game.players.forEach((player) => {
        if (player.id !== playerId) {
          drawCards(player, 1);
        }
      });
      break;
  }
}

// Deck management
function drawCard(game: GameSession): Card | null {
  if (game.deck.length === 0) {
    if (game.mode === "classic") {
      reshuffleDeck(game);
    } else {
      // Tender mode - no reshuffling
      return null;
    }
  }

  return game.deck.pop() || null;
}
```

### Error Handling Patterns

```typescript
// Graceful error handling for bot operations
bot.catch(async (err) => {
  console.error("Bot error:", err);

  if (err.error_code === 403) {
    // User blocked bot - remove from active games
    handleBlockedUser(err.payload.chat_id);
  }
});

// Timeout handling for inactive players
function setupPlayerTimeout(game: GameSession, playerId: number) {
  setTimeout(() => {
    const currentGame = gameState.get(game.groupChatId);
    if (
      currentGame?.state === "player_turn" &&
      getCurrentPlayer(currentGame)?.id === playerId
    ) {
      // Auto-draw card for inactive player
      autoDrawForPlayer(currentGame, playerId);
    }
  }, 60000); // 1 minute timeout
}
```

### Development and Deployment

```typescript
// Environment configuration
const config = {
  botToken: Deno.env.get("TELEGRAM_BOT_TOKEN"),
  port: parseInt(Deno.env.get("PORT") || "8000"),
  webhookUrl: Deno.env.get("WEBHOOK_URL"),
};

// Webhook setup for production
if (config.webhookUrl) {
  bot.start({
    webhook: {
      port: config.port,
      secret_token: Deno.env.get("WEBHOOK_SECRET"),
    },
  });
} else {
  // Long polling for development
  bot.start();
}
```

### Testing Patterns (Future)

```typescript
// Mock context for testing
function createMockContext(overrides: Partial<Context>): Context {
  return {
    chat: { id: 123, type: "group" },
    from: { id: 456, first_name: "Test User" },
    reply: async (text: string) => ({ message_id: 1 }),
    answerCallbackQuery: async (text: string) => true,
    ...overrides,
  } as Context;
}

// Game state assertions
function assertGameState(game: GameSession, expectedState: GameState) {
  if (game.state !== expectedState) {
    throw new Error(`Expected ${expectedState}, got ${game.state}`);
  }
}
```
