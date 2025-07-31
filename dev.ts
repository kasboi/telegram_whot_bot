#!/usr/bin/env -S deno run --allow-all
/**
 * Development entry point for Telegram Whot Bot
 * This runs the bot in polling mode for local development
 */

import { initBot, startBotPolling } from "./src/bot.ts"
import { logger } from "./src/utils/logger.ts"

// Check if environment is set up correctly
function checkEnvironment() {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")

  if (!botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN environment variable is missing!")
    console.error("")
    console.error("To get a bot token:")
    console.error("1. Message @BotFather on Telegram")
    console.error("2. Create a new bot with /newbot")
    console.error("3. Copy the token and set it as an environment variable")
    console.error("")
    console.error("Then run:")
    console.error('export TELEGRAM_BOT_TOKEN="your_token_here"')
    console.error("deno task dev")
    // Deno.exit(1)
  }

  console.log("✅ Environment variables loaded")
  console.log(`🤖 Bot token: ${botToken.substring(0, 10)}...`)
}

// Main development startup
function main() {
  console.log("🎮 Starting Telegram Whot Bot in development mode...")
  console.log("")

  checkEnvironment()

  try {
    // Initialize bot handlers
    initBot()
    console.log("✅ Bot handlers initialized")

    // Start polling
    console.log("🚀 Starting bot polling...")
    console.log("   Bot will listen for messages from Telegram")
    console.log("   Press Ctrl+C to stop")
    console.log("")

    startBotPolling()
  } catch (error) {
    logger.error("Failed to start bot in development mode", {
      error: error instanceof Error ? error.message : String(error),
    })
    console.error("❌ Failed to start bot:", error)
    // Deno.exit(1)
  }
}

// Handle unhandled errors
globalThis.addEventListener("unhandledrejection", (event) => {
  logger.error("Unhandled promise rejection", {
    error: event.reason instanceof Error
      ? event.reason.message
      : String(event.reason),
  })
  console.error("❌ Unhandled error:", event.reason)
})

// Start the bot
if (import.meta.main) {
  main()
}
