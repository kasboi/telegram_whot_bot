# Game Logic Deep Dive

This document explains the core mechanics of the Whot game as implemented in the `src/game/` directory. This part of the codebase is completely independent of the Telegram API.

## The `GameSession` Object

The entire state of a single game is stored in a `GameSession` object, which is defined in `src/types/game.ts`. This object is stored in an in-memory `Map` in `src/game/state.ts`, with the Telegram group chat ID serving as the key.

Key properties of the `GameSession` include:

-   `state`: The current phase of the game (`waiting_for_players`, `in_progress`, `ended`).
-   `players`: An array of `Player` objects, where each player's hand of cards is stored.
-   `deck`: The array of `Card` objects that forms the draw pile.
-   `discardPile`: An array of `Card` objects that have been played.
-   `lastPlayedCard`: The card at the top of the discard pile that players must match.
-   `currentPlayerIndex`: The index of the player in the `players` array whose turn it is.
-   `pendingEffect`: An object that stores the state of a special card effect that needs to be resolved, such as a "Pick Two" penalty.
-   `chosenSymbol`: Stores the symbol chosen by a player after playing a Whot card.

## The Card System (`cards.ts`)

-   **Deck Creation:** The `createDeck()` function builds a standard 54-card Whot deck based on the `DECK_COMPOSITION` constant. This constant accurately reflects the official distribution of numbers and symbols.
-   **Shuffling:** The `shuffleDeck()` function uses the Fisher-Yates algorithm to ensure a random and fair shuffle.
-   **Dealing:** The `dealCards()` function handles the initial distribution of cards to each player and sets aside the first card for the discard pile.
-   **Play Validation:** The `canPlayCard()` and `canPlayCardWithChosen()` functions are the core of the game's rules. They check if a card is a valid move based on the simple rule: **match the symbol or match the number**. The `WithChosen` variant adds the logic for handling a symbol selected after a Whot card is played.

## Special Card Effects (`special.ts`)

This file acts as a rulebook for all the special cards in the game.

-   **`getCardEffect(card)`**: This is the main function. It takes a card and returns a `SpecialCardEffect` object that describes what the card does. For example, for a card with number 2, it returns `{ type: 'pick_cards', pickAmount: 2 }`.

-   **Stacking Logic (`canStackCard`)**: This function determines if a special card can be played on top of another to stack its effect. In this implementation, only "Pick Two" and "Pick Three" cards can be stacked on cards of the same type.

-   **Effect Resolution**: The logic for resolving these effects is handled within the `playCard` function in `state.ts`. For example, when `playCard` sees a card with a `skip_turn` effect, it directly manipulates the `currentPlayerIndex` to move it ahead by two spots instead of one.

## State Management (`state.ts`)

This is the largest and most important file in the `game` directory. It contains all the functions that are allowed to modify a `GameSession`.

-   **`createGame`, `addPlayer`, `removePlayer`**: These functions manage the lifecycle of a game before it starts.

-   **`playCard(groupChatId, userId, cardIndex)`**: This is the most complex function. It is responsible for:
    1.  Validating that it is the correct player's turn.
    2.  Checking if the chosen card is a valid move against the `lastPlayedCard`.
    3.  Removing the card from the player's hand and adding it to the `discardPile`.
    4.  Calling `getCardEffect` to see if the card has a special effect.
    5.  Applying the effect (e.g., setting a `pendingEffect`, changing the `currentPlayerIndex`, or requiring a symbol choice).
    6.  Checking for a winner (if the player's hand is now empty).
    7.  Advancing the turn to the next player.

-   **`drawCard(groupChatId, userId)`**: This function handles the logic for when a player chooses to draw a card. Its key responsibilities are:
    1.  First, checking if there is a `pendingEffect` (like a "Pick Two"). If so, it forces the player to draw the penalty amount and clears the effect.
    2.  If there is no pending effect, it draws a single card from the `deck` and adds it to the player's hand.
    3.  It then advances the turn to the next player.

-   **Deck Exhaustion and Sudden Death**: The `state.ts` module implements a robust system for handling what happens when the draw pile (`deck`) runs out of cards.
    1.  **First Exhaustion**: The first time a player needs to draw a card and the deck is empty, the `reshuffleDeckFromDiscard` function is called. It takes all but the top card from the `discardPile`, shuffles them, and creates a new deck.
    2.  **Second Exhaustion (Sudden Death)**: If the deck runs out a *second* time, the game enters "Sudden Death" mode. No more cards can be drawn. If a player is forced to draw (either for a penalty or on their turn) and cannot, the game immediately ends. The winner is determined by calculating the point value of the cards remaining in each player's hand (using `calculateHandValue`), and the player with the *lowest* score wins.

This separation of concerns—with `cards.ts` defining the objects, `special.ts` defining the rules, and `state.ts` managing the flow—makes the game logic modular and easier to maintain.
