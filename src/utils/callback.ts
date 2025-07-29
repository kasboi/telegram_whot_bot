import { Context } from 'https://deno.land/x/grammy@v1.37.0/mod.ts'
import { logger } from './logger.ts'

/**
 * Safely answers a callback query, handling expired queries gracefully
 * @param ctx - The callback query context
 * @param text - The response text to show, or an options object
 * @param showAlert - Whether to show as an alert (default: false, ignored if text is object)
 */
export async function safeAnswerCallbackQuery(
  ctx: Context,
  text: string | { text: string; show_alert?: boolean },
  showAlert: boolean = false
): Promise<boolean> {
  try {
    if (typeof text === 'string') {
      await ctx.answerCallbackQuery({ text, show_alert: showAlert })
    } else {
      await ctx.answerCallbackQuery(text)
    }
    return true
  } catch (error) {
    // Check if it's an expired query error
    if (error instanceof Error &&
      (error.message.includes('query is too old') ||
        error.message.includes('query ID is invalid'))) {
      logger.debug('Callback query expired - ignoring', {
        userId: ctx.from?.id,
        userName: ctx.from?.first_name,
        error: error.message
      })
      return false
    }

    // For other errors, still log but don't throw
    logger.warn('Failed to answer callback query', {
      userId: ctx.from?.id,
      userName: ctx.from?.first_name,
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}
