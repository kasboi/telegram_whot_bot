import { Bot } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { MyContext } from '../bot.ts'
import { logger } from '../utils/logger.ts'

/**
 * Simplified admin commands for session-based architecture
 */

// List of admin users (replace with actual admin user IDs)
const ADMIN_USERS: number[] = [
  // Add your admin user IDs here
  // Example: 123456789
]

const adminHelpMessage = `🔧 **Admin Commands (Simplified):**

**Session-Based Architecture:**
• Sessions are chat-specific and ephemeral
• No global game management available
• Use standard game commands in group chats

**Available:**
• Standard game commands work normally
• Each chat maintains its own session
`

/**
 * Check if user is admin
 */
function isAdmin(userId: number): boolean {
  return ADMIN_USERS.includes(userId)
}

export function handleAdminCommands(bot: Bot<MyContext>) {
  // Simplified admin help command
  bot.command('adminhelp', async (ctx: MyContext) => {
    const userId = ctx.from?.id
    if (!userId || !isAdmin(userId)) {
      await ctx.reply('❌ You are not authorized to use admin commands.')
      return
    }

    await ctx.reply(adminHelpMessage, { parse_mode: 'Markdown' })
  })

  logger.info('Simplified admin handlers initialized')
}
