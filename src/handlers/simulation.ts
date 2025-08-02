import { CommandContext } from "https://deno.land/x/grammy@v1.37.0/mod.ts"
import { GameSession, Player, Card, WhotSymbol } from "../types/game.ts"
import { isAdmin } from "../utils/auth.ts"
import { playCard, drawCard } from "../game/state.ts"
import { MyContext } from "../bot.ts"

// In-memory store for the simulation game
export let simulationGame: GameSession | null = null

/**
 * Command: /sim_start <num_players>
 * Starts a new simulation with a specified number of dummy players.
 */
export const simStartCommand = async (ctx: CommandContext<MyContext>) => {
    if (ctx.chat.type !== 'private') {
        return ctx.reply('Simulation commands can only be used in a private chat.')
    }

    if (!await isAdmin(ctx)) {
        return ctx.reply("You are not authorized to use this command.")
    }

    const numPlayers = parseInt(ctx.match, 10)
    if (isNaN(numPlayers) || numPlayers <= 0) {
        return ctx.reply("Invalid number of players. Usage: /sim_start <num_players>")
    }

    // Create dummy players
    const players: Player[] = []
    for (let i = 0; i < numPlayers; i++) {
        players.push({
            id: i + 1, // Simple numeric IDs for players
            firstName: `Player ${i + 1}`,
            state: 'active',
            cardsPlayedCount: 0,
            specialCardsPlayedCount: 0,
            hand: [],
        })
    }

    // Create a new simulation game session
    simulationGame = {
        id: ctx.chat.id,
        state: 'in_progress', // Start directly in progress
        creatorId: ctx.from?.id || 0,
        players,
        deck: [],
        discardPile: [],
        playedCards: [],
        currentPlayerIndex: 0,
        direction: 'clockwise',
        createdAt: new Date(),
        isSimulation: true, // Flag to identify this as a simulation
    }

    ctx.reply(`✅ Simulation started with ${numPlayers} players.\nUse /sim_status to see the current state.`)
}

/**
 * Command: /sim_status
 * Shows the complete current state of the game (hands, deck, turn, etc.).
 */
export const simStatusCommand = async (ctx: CommandContext<MyContext>) => {
    if (!simulationGame) {
        return ctx.reply("No active simulation found. Use /sim_start to begin.")
    }

    const { players, deck, discardPile, currentPlayerIndex } = simulationGame

    let status = `*Simulation Status*\n\n`
    status += `*Turn:* Player ${currentPlayerIndex !== undefined ? currentPlayerIndex + 1 : 'N/A'}\n`
    status += `*Mode:* Tender-Only (no reshuffling)\n\n`

    status += `*Players:*\n`
    players.forEach((player, index) => {
        status += `  Player ${index + 1}: ${player.hand?.map(cardToString).join(", ") || "No cards"}\n`
    })

    status += `\n*Deck (${deck?.length} cards):* ${deck?.map(cardToString).join(", ") || "Empty"}\n`
    status += `*Discard Pile (${discardPile?.length} cards):* ${discardPile?.map(cardToString).join(", ") || "Empty"}\n`

    ctx.reply(status, { parse_mode: "Markdown" })
}

/**
 * Command: /sim_set <target> <value>
 * Sets various aspects of the game state.
 */
export const simSetCommand = async (ctx: CommandContext<MyContext>) => {
    if (!simulationGame) {
        return ctx.reply("No active simulation found. Use /sim_start to begin.")
    }

    const [target, ...value] = ctx.match.split(" ")

    switch (target) {
        case "hand":
            const [playerIndex, cardsStr] = value
            const player = simulationGame.players[parseInt(playerIndex)]
            if (player) {
                player.hand = cardsStr.split(",").map(stringToCard)
            }
            break
        case "deck":
            simulationGame.deck = value.join(" ").split(",").map(stringToCard)
            break
        case "turn":
            simulationGame.currentPlayerIndex = parseInt(value[0])
            break
        default:
            return ctx.reply("Invalid target. Usage: /sim_set <hand|deck|turn> <value>")
    }

    simStatusCommand(ctx)
}

/**
 * Command: /sim_action <action> <params>
 * Performs a game action on behalf of a player.
 */
export const simActionCommand = async (ctx: CommandContext<MyContext>) => {
    if (!simulationGame) {
        return ctx.reply("No active simulation found. Use /sim_start to begin.")
    }

    const [action, ...params] = ctx.match.split(" ")
    const playerIndex = parseInt(params[0])
    const player = simulationGame.players[playerIndex]

    if (!player) {
        return ctx.reply("Invalid player index.")
    }

    let result
    switch (action) {
        case "play":
            const cardIndex = parseInt(params[1])
            result = playCard(simulationGame.id, player.id, cardIndex)
            break
        case "draw":
            result = drawCard(simulationGame.id, player.id)
            break
        default:
            return ctx.reply("Invalid action. Usage: /sim_action <play|draw> <params>")
    }

    if (result.message) {
        ctx.reply(result.message)
    }

    simStatusCommand(ctx)
}

/**
 * Command: /sim_end
 * Stops the current simulation and clears the simulation game state.
 */
export const simEndCommand = async (ctx: CommandContext<MyContext>) => {
    simulationGame = null
    ctx.reply("Simulation ended.")
}

const cardToString = (card: Card) => {
    if (card.symbol === 'whot') {
        return "W"
    }
    return `${card.symbol.charAt(0).toUpperCase()}${card.number}`
}

const stringToCard = (str: string): Card => {
    if (str.toUpperCase() === "W") {
        return { id: 'whot_20', symbol: 'whot', number: 20, isSpecial: true }
    }
    const symbol = str.charAt(0).toLowerCase() as WhotSymbol
    const number = parseInt(str.slice(1))
    const symbols: { [key: string]: string } = {
        c: 'circle',
        t: 'triangle',
        s: 'square',
        x: 'cross',
        r: 'star'
    }
    return { id: `${symbols[symbol]}_${number}`, symbol: symbols[symbol] as WhotSymbol, number, isSpecial: [1, 2, 5, 8, 14, 20].includes(number) }
}