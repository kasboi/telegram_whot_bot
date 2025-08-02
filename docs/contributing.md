# Contributing Guide

Thank you for your interest in contributing to the Telegram Whot Bot! This guide provides instructions on how to set up the project, make changes, and contribute effectively.

## Setting Up Your Development Environment

1.  **Install Deno:** If you don't have Deno installed, follow the official instructions at [https://deno.land/manual/getting_started/installation](https://deno.land/manual/getting_started/installation).

2.  **Clone the Repository:**

    ```bash
    git clone <repository_url>
    cd telegram-whot-bot
    ```

3.  **Create `.env` file:**
    Create a file named `.env` in the root directory and add your Telegram Bot Token:

    ```
    TELEGRAM_BOT_TOKEN="your_telegram_bot_token_here"
    ```

    You can get a token by talking to the [BotFather](https://t.me/BotFather) on Telegram.

4.  **Cache Dependencies:**
    Deno handles dependencies differently from Node.js. To cache and check the dependencies, run:

    ```bash
    deno cache src/bot.ts
    ```

5.  **Run the Bot:**
    To start the bot, use the task defined in `deno.json`:
    ```bash
    deno task start
    ```
    This command will automatically watch for file changes and restart the bot.

## How to Add a New Command

Let's say you want to add a new command, `/help`, that provides some basic information.

1.  **Open `src/handlers/commands.ts`:** This is where all command logic resides.

2.  **Add the handler:**

    ```typescript
    // At the top of the file, import Bot and Context if they aren't already
    import { Bot, Context } from "https://deno.land/x/grammy@v1.37.0/mod.ts";

    // ... existing code ...

    // Add a new function to handle the /help command
    export function handleHelp(bot: Bot) {
      bot.command("help", async (ctx: Context) => {
        const helpMessage = `
    🎴 **Welcome to Whot Game Bot!** 🎴
    
    Here are the available commands:
    - /startgame: Start a new game in a group chat.
    - /mycards: Get your current hand of cards in a private message.
    - /help: Show this help message.
    
    **How to Play:**
    1. Add the bot to a group.
    2. Use /startgame to create a lobby.
    3. Players join using the buttons.
    4. The creator starts the game.
    5. Play your cards via private message with the bot!
    `;
        await ctx.reply(helpMessage, { parse_mode: "Markdown" });
      });
    }
    ```

3.  **Register the handler in `src/bot.ts`:**
    Open `src/bot.ts` and import your new handler, then call it.

    ```typescript
    // ... other imports ...
    import {
      handleStartGame,
      handleCallbackQuery,
      handleMyCards,
      handleHelp,
    } from "./handlers/commands.ts";
    // ... other code ...

    // Register command handlers
    handleStartGame(bot);
    handleCallbackQuery(bot);
    handleMyCards(bot);
    handleHelp(bot); // Add this line

    // ... rest of the file ...
    ```

4.  **Update Bot Commands (Optional but Recommended):**
    To make the command visible in the Telegram UI menu, add it to the `setupBotCommands` function in `src/bot.ts`.

    ```typescript
    async function setupBotCommands() {
      await bot.api.setMyCommands([
        { command: "start", description: "Welcome message and bot info" },
        { command: "startgame", description: "Start a new Whot game" },
        { command: "mycards", description: "Get your cards" },
        { command: "help", description: "Show help information" }, // Add this line
      ]);
      logger.info("Bot commands registered successfully");
    }
    ```

That's it! You've successfully added a new command.

## Debugging

The primary tool for debugging is the logger. The bot uses two loggers:

- **`logger`**: Writes plain text logs to `bot.log`.

When you encounter a bug, follow these steps:

1.  **Check the Console:** The bot logs all messages to the console where you are running `deno task start`. This is the first place to look for errors.
2.  **Check the Log Files:** The `bot.log` and `bot.log.json` files contain a history of events. The JSON log is particularly useful for understanding the context of an error, as it includes structured data.
3.  **Add More Logging:** If you can't figure out the problem from the existing logs, don't hesitate to add more logging statements. You can import the logger in any file:

    ```typescript
    import { logger } from "../utils/logger.ts";

    // ... inside a function ...
    logger.info("My custom debug message", { someData: "hello" });
    ```

## Project Structure Overview

- `src/bot.ts`: Main application entry point.
- `src/game/`: Core game logic (state, cards, special rules).
- `src/handlers/`: Telegram update handlers (commands, private messages).
- `src/types/`: TypeScript type definitions.
- `src/utils/`: Utility functions (like the logger).
- `deno.json`: Project configuration and scripts.
- `README.md`: Project overview and setup instructions.
