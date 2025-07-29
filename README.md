# Telegram Whot Game Bot

This is a Telegram bot that allows users to play the classic card game Whot with friends in a group chat.

## Features

-   **Multiplayer Gameplay:** Play Whot with 2 or more players in any Telegram group chat.
-   **Interactive UI:** The bot uses inline buttons for all actions, from joining a game to playing cards.
-   **Private Hand Management:** Players manage their cards and make their moves in a private chat with the bot, keeping their hand secret.
-   **Full Whot Rule Set:** Implements all standard Whot card rules, including special cards like "Pick Two", "Suspension", "General Market", and the mighty "Whot" card itself.
-   **Automatic State Management:** The bot handles all the game logic, including turns, card validation, and special effects.
-   **Sudden Death Mode:** If the draw pile is exhausted twice, the game enters a "Sudden Death" round where the player with the lowest hand value wins.

## Getting Started

A new developer can get the bot up and running on their local machine by following these steps.

### Prerequisites

-   [Deno](https://deno.land) runtime installed on your machine.
-   A Telegram Bot Token. You can get one by talking to the [@BotFather](https://t.me/BotFather) on Telegram.

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd telegram-whot-bot
    ```

2.  **Set up Environment Variables:**
    Create a file named `.env` in the root of the project and add your Telegram Bot Token:
    ```
    TELEGRAM_BOT_TOKEN="your_telegram_bot_token_here"
    ```
    The bot uses `jsr:@std/dotenv/load` to automatically load this variable.

3.  **Run the bot using Deno Tasks:**
    The project comes with pre-configured Deno tasks. To run the bot in development mode (with file watching and automatic restarts), use:
    ```bash
    deno task dev
    ```
    To run it for production, use:
    ```bash
    deno task start
    ```

## How to Play

1.  Add your bot to a Telegram group chat.
2.  Send the `/startgame` command to create a new game lobby.
3.  Other players in the group can click the "Join Game" button.
4.  Once at least two players have joined, the user who created the game can click the "Start Game" button.
5.  The bot will announce that the game has started, and each player will receive their hand of cards in a private message from the bot.
6.  Players take turns playing cards by clicking the buttons in their private chat. The bot will update the group chat with the game's progress.
7.  The first player to run out of cards wins!

## Project Structure

The codebase is organized into several directories to separate concerns:

```
/home/generalkas/projects/telegram_whot_mvp/
├── docs/
│   ├── architecture.md   # High-level overview of the system architecture
│   ├── contributing.md   # Guide for new developers
│   └── game_logic.md     # Deep dive into the game mechanics
├── src/
│   ├── bot.ts            # Main application entry point and bot initialization
│   ├── game/             # Core game logic (completely Telegram-agnostic)
│   │   ├── cards.ts
│   │   ├── special.ts
│   │   └── state.ts
│   ├── handlers/         # Logic for handling updates from Telegram
│   │   ├── commands.ts
│   │   ├── private.ts
│   │   ├── stats.ts
│   │   └── updates.ts
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions (e.g., loggers)
├── .gitignore
├── deno.json           # Deno configuration and task runner
└── README.md           # This file
```

For a deeper understanding of the project, please refer to the documents in the `docs/` directory.

## Contributing

Contributions are welcome! Please read the [Contributing Guide](docs/contributing.md) for instructions on how to add new features, debug issues, and submit your changes.