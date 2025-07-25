# Telegram Whot Game Bot

## Stage 1 Complete: Foundation ✅ + Bug Fixes

### What's Implemented:

- ✅ Basic bot setup with grammY framework
- ✅ `/startgame` command (group chats only)
- ✅ Join game functionality with inline buttons
- ✅ Start game button (creator-only)
- ✅ Basic game state management
- ✅ Player tracking and validation
- ✅ **File logging system** (logs to `bot.log`)
- ✅ **Improved callback query feedback** with alerts
- ✅ **Fixed join game state logic** (allows joining after 2+ players)

### Bug Fixes Applied:

1. ✅ **Join game feedback**: Now uses `show_alert` for better user feedback
2. ✅ **State transition bug**: Fixed issue where players couldn't join after game became "ready_to_start"
3. ✅ **Comprehensive logging**: All bot actions now logged to `bot.log` with structured data
4. ✅ **Error handling**: Better error messages and logging for debugging

### How to Run:

1. Get a bot token from [@BotFather](https://t.me/botfather) on Telegram
2. Set environment variable:
   ```bash
   export TELEGRAM_BOT_TOKEN="your_bot_token_here"
   ```
3. Run the bot:
   ```bash
   deno run --allow-net --allow-env src/bot.ts
   ```

### Testing:

1. Add the bot to a group chat
2. Use `/startgame` to create a game
3. Click "Join Game" to join (need 2+ players)
4. Creator can click "Start Game" when ready

### Next Stage (Stage 2):

- Card deck implementation
- Deal cards to players
- Basic card play mechanics
- Private chat card hands

---

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Required: Your Telegram bot token

## Project Structure

```
src/
├── bot.ts              # Main bot entry point
├── game/
│   └── state.ts        # Game state management
├── handlers/
│   └── commands.ts     # Command handlers
└── types/
    └── game.ts         # TypeScript interfaces
```
