# System Architecture

This document provides a high-level overview of the Telegram Whot Bot's architecture. Understanding this is key to debugging issues and adding new features correctly.

## Core Components

The bot is built around a few key components that work together to deliver the game experience:

- **`src/bot.ts` (The Conductor):** This is the main entry point of the application. It initializes the `grammY` bot instance, connects to Telegram, and, most importantly, registers all the handlers that listen for user actions. Think of it as the central hub that directs incoming traffic to the right place.

- **`src/handlers/` (The Listeners):** This directory contains the logic for reacting to specific user inputs from Telegram.
    - **`commands.ts`**: Handles slash commands like `/startgame` and `/mycards`. It also manages the callback queries from the initial "Join Game" / "Start Game" buttons.
    - **`private.ts`**: This is the heart of the gameplay interaction. It handles all the callback queries that happen in the private chat with the bot, such as playing a card, drawing a card, or selecting a symbol for a Whot card.
    - **`updates.ts`**: Contains logic for generating the public-facing messages that are posted in the group chat to show the game's status.
    - **`stats.ts`**: Handles the logic for sending game statistics to players after a game has concluded.

- **`src/game/` (The Rule Engine):** This is the most critical part of the bot. It is a self-contained module that knows nothing about Telegram. It simply enforces the rules of the Whot card game.
    - **`state.ts`**: The single source of truth for all game data. It uses a `Map` to store `GameSession` objects, keyed by the group chat ID. It contains all the functions for modifying the game state, such as `createGame`, `addPlayer`, `playCard`, and `drawCard`.
    - **`cards.ts`**: Defines the deck, how to create it, how to shuffle it, and the basic rules for which cards can be played on others.
    - **`special.ts`**: A specialized part of the rule engine that knows what to do when a "special" card (like Pick Two, Hold On, or Whot) is played.

- **`src/types/` (The Blueprint):** This directory defines the shape of the data that flows through the system, most importantly the `GameSession` and `Player` interfaces.

## The Flow of a Game

Here’s how the components interact during a typical game sequence:

### 1. Starting a Game

1.  A user in a group chat sends the `/startgame` command.
2.  `bot.ts` receives the update and routes it to the `handleStartGame` function in `handlers/commands.ts`.
3.  `handleStartGame` calls `createGame` and `addPlayer` from `game/state.ts` to create a new `GameSession` in the in-memory state.
4.  It then sends a message to the group chat with "Join Game" and "Leave Game" buttons.

### 2. A Player Joins

1.  Another user clicks the "Join Game" button.
2.  `bot.ts` receives the callback query and routes it to `handleCallbackQuery` in `handlers/commands.ts`.
3.  `handleCallbackQuery` calls `addPlayer` from `game/state.ts`.
4.  It then edits the original message to update the player list.

### 3. The Game Begins

1.  The creator clicks "Start Game".
2.  This is handled again by `handleCallbackQuery` in `handlers/commands.ts`.
3.  It calls `startGameWithCards` from `game/state.ts`, which deals the cards and sets the game state to `in_progress`.
4.  Crucially, it then loops through all players and calls `sendPlayerHand` from `handlers/private.ts` for each one. This sends the initial hand of cards to each player via private message.
5.  Finally, it calls `generateGroupStatusMessage` from `handlers/updates.ts` to post the initial game state to the group chat.

### 4. A Player Plays a Card

1.  The current player is in a private message with the bot. They click on a card button.
2.  `bot.ts` receives this callback query and, based on its pattern (`play_...`), routes it to `handleCardPlay` in `handlers/private.ts`.
3.  `handleCardPlay` calls the `playCard` function from `game/state.ts`. This function contains all the core logic: it validates the move, removes the card from the player's hand, applies any special effects, and determines the next player.
4.  If the card was a Whot card, `handleCardPlay` will instead call `showSymbolSelection` to prompt the user for a symbol.
5.  After the move is complete, `handleCardPlay` calls `updateAllPlayerHands` to send updated hand views to every player in the game.
6.  It also posts an updated status message to the group chat.

This cycle of **User Action -> Handler -> Game State -> Update Players** is the fundamental pattern of the entire application. When debugging, you can trace this flow to pinpoint where a problem might be occurring.
