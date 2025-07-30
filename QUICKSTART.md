# Quick Start Guide

## 🚀 Get Running in 2 Minutes

### 1. Setup Environment

```bash
# Create environment file
deno task setup

# Edit .env with your bot token
nano .env
# Add: BOT_TOKEN=your_telegram_bot_token_here
```

### 2. Start Development

```bash
# Run with auto-reload
deno task dev
```

### 3. Test Your Bot

1. Add bot to a Telegram group
2. Send `/startgame` in the group
3. Click "Join Game" to test

## 🛠️ Development Commands

```bash
# Development (polling mode)
deno task dev          # With file watching
deno task start        # Single run

# Production (webhook mode)
deno task webhook      # For Deno Deploy
deno task webhook:dev  # With file watching

# Code quality
deno task check        # Type check
deno task fmt          # Format code
deno task lint         # Lint code
```

## 📁 Key Files

- `dev.ts` - Development entry (polling)
- `main.ts` - Production entry (webhook)
- `src/bot.ts` - Bot configuration
- `src/game/sessionState.ts` - Game storage
- `src/handlers/commands.ts` - Commands

## 🔧 Architecture

- **Sessions**: In-memory game storage per group
- **Dual Chat**: Group coordination + private gameplay
- **grammY**: Modern Telegram bot framework
- **TypeScript**: Full type safety

## 🎮 Game Flow

1. Group: `/startgame` → Join buttons
2. Private: Cards dealt to each player
3. Turns: Play cards privately, updates publicly
4. Win: First to empty hand wins

## 📝 Environment Variables

Required in `.env`:

```bash
BOT_TOKEN=your_telegram_bot_token_here
```

## 🚨 Troubleshooting

**Bot not responding?**

- Check bot token in `.env`
- Verify bot permissions in group
- Check console for errors

**Type errors?**

```bash
deno task check
```

**Need fresh start?**

```bash
# Restart clears all game sessions
deno task dev
```
