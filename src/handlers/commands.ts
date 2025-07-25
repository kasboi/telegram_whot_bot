import { Bot, Context, InlineKeyboard } from "https://deno.land/x/grammy@v1.20.3/mod.ts";
import { createGame, getGame, addPlayer, canStartGame } from '../game/state.ts';

export function handleStartGame(bot: Bot) {
  bot.command('startgame', async (ctx: Context) => {
    // Only allow in group chats
    if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
      await ctx.reply('❌ This command only works in group chats!');
      return;
    }
    
    const groupChatId = ctx.chat.id;
    const creatorId = ctx.from?.id;
    const creatorName = ctx.from?.first_name || 'Unknown';
    
    if (!creatorId) {
      await ctx.reply('❌ Could not identify user.');
      return;
    }
    
    // Check if game already exists
    const existingGame = getGame(groupChatId);
    if (existingGame && existingGame.state !== 'idle' && existingGame.state !== 'ended') {
      await ctx.reply('🎮 A game is already in progress in this group!');
      return;
    }
    
    // Create new game
    const game = createGame(groupChatId, creatorId, creatorName);
    
    // Create join button
    const keyboard = new InlineKeyboard()
      .text('🃏 Join Game', `join_${groupChatId}`);
    
    await ctx.reply(
      `🎴 **Whot Game Started!** 🎴\n\n` +
      `🎯 Game created by ${creatorName}\n` +
      `👥 Waiting for players to join...\n` +
      `⏳ Need at least 2 players to start\n\n` +
      `Click the button below to join:`,
      { 
        reply_markup: keyboard,
        parse_mode: 'Markdown' 
      }
    );
  });
}

export function handleJoinGame(bot: Bot) {
  bot.callbackQuery(/^join_(\d+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1]);
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'Unknown';
    
    const success = addPlayer(groupChatId, userId, userName);
    
    if (!success) {
      await ctx.answerCallbackQuery('❌ Could not join game (already joined or game not available)');
      return;
    }
    
    const game = getGame(groupChatId);
    if (!game) {
      await ctx.answerCallbackQuery('❌ Game not found');
      return;
    }
    
    await ctx.answerCallbackQuery(`✅ You joined the game!`);
    
    // Update the message with current players and start button if ready
    let messageText = `🎴 **Whot Game** 🎴\n\n` +
                     `🎯 Created by: ${game.players.length > 0 ? 'Creator' : 'Unknown'}\n` +
                     `👥 Players (${game.players.length}):\n`;
    
    game.players.forEach((player, index) => {
      messageText += `${index + 1}. ${player.firstName}\n`;
    });
    
    let keyboard = new InlineKeyboard()
      .text('🃏 Join Game', `join_${groupChatId}`);
    
    // Add start button if game is ready
    if (game.state === 'ready_to_start') {
      messageText += `\n✅ Ready to start! (Creator can tap "Start Game")`;
      keyboard = keyboard
        .row()
        .text('🚀 Start Game', `start_${groupChatId}`);
    }
    
    await ctx.editMessageText(messageText, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });
  });
}

export function handleStartButton(bot: Bot) {
  bot.callbackQuery(/^start_(\d+)$/, async (ctx) => {
    const groupChatId = parseInt(ctx.match![1]);
    const userId = ctx.from.id;
    
    if (!canStartGame(groupChatId, userId)) {
      await ctx.answerCallbackQuery('❌ Only the game creator can start the game when ready!');
      return;
    }
    
    const game = getGame(groupChatId);
    if (!game) {
      await ctx.answerCallbackQuery('❌ Game not found');
      return;
    }
    
    // Mark game as in progress
    game.state = 'in_progress';
    game.players.forEach(player => player.state = 'active');
    
    await ctx.answerCallbackQuery('🎮 Game started!');
    
    // Update message to show game has started
    let messageText = `🎮 **Whot Game - IN PROGRESS** 🎮\n\n` +
                     `👥 Players:\n`;
    
    game.players.forEach((player, index) => {
      messageText += `${index + 1}. ${player.firstName} ✅\n`;
    });
    
    messageText += `\n🚀 Game started! Players will receive their cards in private chat.`;
    
    await ctx.editMessageText(messageText, {
      parse_mode: 'Markdown'
    });
    
    // TODO Stage 2: Send cards to players in private chat
    console.log(`Game started in group ${groupChatId} with ${game.players.length} players`);
  });
}
