import { Bot, Context, InlineKeyboard } from "https://deno.land/x/grammy@v1.37.0/mod.ts"
import { createGame, getGame, addPlayer, removePlayer, canStartGame, startGameWithCards } from '../game/state.ts'
import { logger } from '../utils/logger.ts'
import { sendPlayerHand } from './private.ts'
import { generateGroupStatusMessage } from "./updates.ts"

async function updateLobbyMessage(ctx: Context, groupChatId: number) {
    const game = getGame(groupChatId)
    if (!game) {
        await ctx.editMessageText('🚫 **Game Cancelled**\n\nThe game lobby is now empty.')
        return
    }

    let messageText = `🎴 **Whot Game** 🎴\n\n` +
        `🎯 Created by: ${game.players.find(p => p.id === game.creatorId)?.firstName || 'Creator'}\n` +
        `👥 Players (${game.players.length}):\n`

    game.players.forEach((player, index) => {
        messageText += `${index + 1}. ${player.firstName}\n`
    })

    const keyboard = new InlineKeyboard()
        .text('🃏 Join Game', `join_${groupChatId}`)
        .text('🚪 Leave Game', `leave_${groupChatId}`)

    if (game.state === 'ready_to_start') {
        messageText += `\n✅ Ready to start! (Creator can tap "Start Game")`
        keyboard.row().text('🚀 Start Game', `start_${groupChatId}`)
    } else {
        messageText += `\n⏳ Need at least ${2 - game.players.length} more player(s) to start.`
    }

    await ctx.editMessageText(messageText, {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    })
}

export function handleStartGame(bot: Bot) {
    bot.command('startgame', async (ctx: Context) => {
        // Only allow in group chats
        if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
            await ctx.reply('❌ This command only works in group chats!')
            return
        }

        const groupChatId = ctx.chat.id
        const creatorId = ctx.from?.id
        const creatorName = ctx.from?.first_name || 'Unknown'

        if (!creatorId) {
            await ctx.reply('❌ Could not identify user.')
            return
        }

        // Check if game already exists
        const existingGame = getGame(groupChatId)
        if (existingGame) {
            if (existingGame.state === 'in_progress') {
                await ctx.reply('🎮 A game is already in progress in this group!')
                return
            } else if (existingGame.state === 'ready_to_start' || existingGame.state === 'waiting_for_players') {
                // Check if the user is the creator and can start the game immediately
                if (existingGame.creatorId === creatorId && existingGame.state === 'ready_to_start') {
                    // Creator using /startgame on a ready game - auto-start it
                    const success = startGameWithCards(groupChatId)
                    if (success) {
                        await ctx.reply('🎮 **Game Started!** 🎮\n\nCards have been dealt! Check your private messages for your hand.')
                        
                        const game = getGame(groupChatId)
                        if (game) {
                            const messageText = generateGroupStatusMessage(game)
                            await ctx.reply(messageText, { parse_mode: 'Markdown' })

                            // Send hands to all players
                            for (const player of game.players) {
                                await sendPlayerHand(bot, groupChatId, player.id, player.firstName)
                            }
                        }
                        return
                    } else {
                        await ctx.reply('❌ Failed to start game. Please try again.')
                        return
                    }
                }
                
                // Not creator or game not ready - show lobby
                await ctx.reply('🔄 Rejoining existing game lobby...')
                
                // Update lobby message
                const keyboard = new InlineKeyboard()
                    .text('🃏 Join Game', `join_${groupChatId}`)
                    .text('🚪 Leave Game', `leave_${groupChatId}`)

                let messageText = `🎴 **Whot Game** 🎴\n\n` +
                    `� Created by: ${existingGame.players.find(p => p.id === existingGame.creatorId)?.firstName || 'Creator'}\n` +
                    `👥 Players (${existingGame.players.length}):\n`

                existingGame.players.forEach((player, index) => {
                    messageText += `${index + 1}. ${player.firstName}\n`
                })

                if (existingGame.state === 'ready_to_start') {
                    messageText += `\n✅ Ready to start! (Creator can tap "Start Game")`
                    keyboard.row().text('🚀 Start Game', `start_${groupChatId}`)
                } else {
                    messageText += `\n⏳ Need at least ${2 - existingGame.players.length} more player(s) to start.`
                }

                await ctx.reply(messageText, {
                    reply_markup: keyboard,
                    parse_mode: 'Markdown'
                })
                return
            }
            // For 'ended' games, allow creating new game (will fall through)
        }

        // Create new game
        createGame(groupChatId, creatorId, creatorName)

        // Automatically add the creator to the game
        addPlayer(groupChatId, creatorId, creatorName)

        // Create join and leave buttons
        const keyboard = new InlineKeyboard()
            .text('🃏 Join Game', `join_${groupChatId}`)
            .text('🚪 Leave Game', `leave_${groupChatId}`)

        await ctx.reply(
            `🎴 **Whot Game Started!** 🎴\n\n` +
            `🎯 Game created by ${creatorName}\n` +
            `👥 Players: ${creatorName} (1)\n` +
            `⏳ Need at least 1 more player to start\n\n` +
            `Click a button below to join or leave:`,
            {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            }
        )
    })
}

export function handleCallbackQuery(bot: Bot) {
    bot.callbackQuery(/^(join|leave|start)_(-?\d+)$/, async (ctx) => {
        const action = ctx.match![1]
        const groupChatId = parseInt(ctx.match![2])
        const userId = ctx.from.id
        const userName = ctx.from.first_name || 'Unknown'

        logger.info('Game action button clicked', { action, groupChatId, userId, userName })

        switch (action) {
            case 'join': {
                const success = addPlayer(groupChatId, userId, userName)

                if (!success) {
                    const game = getGame(groupChatId)
                    let errorMessage = '❌ Could not join game'

                    if (!game) {
                        errorMessage = '❌ Game not found'
                    } else if (game.players.some(p => p.id === userId)) {
                        errorMessage = '✅ You are already in this game!'
                    } else if (game.state === 'in_progress') {
                        errorMessage = '❌ Game has already started'
                    } else {
                        errorMessage = '❌ Cannot join game at this time'
                    }

                    await ctx.answerCallbackQuery({ text: errorMessage, show_alert: true })
                    return
                }

                await ctx.answerCallbackQuery({ text: `✅ You joined the game!` })
                await updateLobbyMessage(ctx, groupChatId)
                break
            }

            case 'leave': {
                const result = removePlayer(groupChatId, userId)

                if (!result.success) {
                    await ctx.answerCallbackQuery({ text: '❌ You are not in the game or the game has started.', show_alert: true })
                    return
                }

                await ctx.answerCallbackQuery({ text: '🚪 You left the game.' })

                if (result.gameCancelled) {
                    await ctx.editMessageText(`🚫 **Game Cancelled** 🚫\n\nThe creator, ${userName}, left the game.`)
                } else {
                    await updateLobbyMessage(ctx, groupChatId)
                }
                break
            }

            case 'start': {
                if (!canStartGame(groupChatId, userId)) {
                    await ctx.answerCallbackQuery({ text: '❌ Only the creator can start the game and you need at least 2 players.', show_alert: true })
                    return
                }

                const success = startGameWithCards(groupChatId)
                if (!success) {
                    await ctx.answerCallbackQuery({ text: '❌ Failed to start game', show_alert: true })
                    return
                }

                await ctx.answerCallbackQuery('🎮 Game started!')

                const game = getGame(groupChatId)
                if (game) {
                    const messageText = generateGroupStatusMessage(game)
                    await ctx.editMessageText(messageText, { parse_mode: 'Markdown' })

                    // Send hands to all players
                    for (const player of game.players) {
                        await sendPlayerHand(bot, groupChatId, player.id, player.firstName)
                    }
                }
                break
            }
        }
    })
}

// Handle /mycards command for players who couldn't receive private messages
export function handleMyCards(bot: Bot) {
    bot.command('mycards', async (ctx) => {
        // Only allow in group chats where there's an active game
        if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
            await ctx.reply('❌ This command only works in group chats with an active game!')
            return
        }

        const groupChatId = ctx.chat.id
        const userId = ctx.from?.id
        const firstName = ctx.from?.first_name || 'Unknown'

        if (!userId) {
            await ctx.reply('❌ Could not identify user.')
            return
        }

        const game = getGame(groupChatId)
        if (!game || game.state !== 'in_progress') {
            await ctx.reply('❌ No active game in this group.')
            return
        }

        const player = game.players.find(p => p.id === userId)
        if (!player) {
            await ctx.reply('❌ You are not part of this game.')
            return
        }

        // Try to send cards via private message
        const success = await sendPlayerHand(bot, groupChatId, userId, firstName)
        if (success) {
            await ctx.reply(`✅ ${firstName}, I've sent your cards via private message!`)
        } else {
            await ctx.reply(
                `❌ ${firstName}, I still can't send you private messages.\n\n` +
                `Please send /start to @${ctx.me.username} in private chat first!`
            )
        }
    })
}

export function handleHelp(bot: Bot) {
    bot.command('help', async (ctx: Context) => {
        const helpMessage = `
🎴 **Welcome to Whot Game Bot!** 🎴

Here are the available commands:
- **/startgame**: Start a new game in a group chat.
- **/mycards**: Get your current hand of cards in a private message.
- **/help**: Show this help message.

**How to Play:**
1. Add the bot to a group.
2. Use **/startgame** to create a lobby.
3. Players join using the buttons.
4. The creator starts the game.
5. Play your cards via private message with the bot!
`
        await ctx.reply(helpMessage, { parse_mode: 'Markdown' })
    })
}

export function handleHowToPlay(bot: Bot) {
    bot.command('howtoplay', async (ctx: Context) => {
        const rulesMsg = `
🃏 **HOW TO PLAY WHOT** 🃏

*THE GOAL*
The goal is simple: be the first player to get rid of all the cards in your hand!

*GETTING STARTED*
1. Add the bot to a group chat.
2. Use **/startgame** to create a new game lobby.
3. Other players click the "Join Game" button.
4. Once you have at least 2 players, the creator can start the game.

*GAMEPLAY*
- You will receive your hand of cards in a private message from me.
- When it's your turn, you must play a card that matches the **symbol** (🔴🔺❌🟦⭐) or the **number** of the card on top of the discard pile.
- If you can't play any of your cards, you must click the "Draw Card" button to take a card from the deck.
- The game continues until one player has no cards left.

*SPECIAL CARDS*
Watch out for these special cards! They can change the game in an instant.

1️⃣ **Hold On**: Play again immediately.
2️⃣ **Pick Two**: The next player must draw 2 cards.
5️⃣ **Pick Three**: The next player must draw 3 cards.
8️⃣ **Suspension**: The next player's turn is skipped.
1️⃣4️⃣ **General Market**: Every other player must draw 1 card.
🃏 **Whot (20)**: This is a wild card! You can play it on any card. After playing it, you get to choose the symbol for the next player to follow.

Now you know the rules. Good luck!
`
        await ctx.reply(rulesMsg, { parse_mode: 'Markdown' })
    })
}
