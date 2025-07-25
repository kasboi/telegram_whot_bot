import { Bot } from "https://deno.land/x/grammy@v1.20.3/mod.ts";
import { handleStartGame, handleJoinGame, handleStartButton } from './handlers/commands.ts';

// Get bot token from environment
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN environment variable is required');
  Deno.exit(1);
}

// Create bot instance
const bot = new Bot(botToken);

// Register command handlers
handleStartGame(bot);
handleJoinGame(bot);
handleStartButton(bot);

// Basic start message
bot.command('start', async (ctx) => {
  const chatType = ctx.chat.type;
  
  if (chatType === 'private') {
    await ctx.reply(
      '🎴 Welcome to Whot Game Bot! 🎴\n\n' +
      '🎯 Add me to a group chat and use /startgame to begin playing!\n' +
      '👥 You need at least 2 players to start a game.'
    );
  } else {
    await ctx.reply(
      '🎴 Whot Game Bot is ready! 🎴\n\n' +
      '🚀 Use /startgame to create a new game in this group!'
    );
  }
});

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start the bot
console.log('🤖 Starting Whot Game Bot...');
console.log('📱 Bot is running and waiting for messages');
bot.start();
