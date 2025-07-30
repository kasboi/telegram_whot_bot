import { webhookCallback } from "https://deno.land/x/grammy@v1.37.0/mod.ts"
import { bot, initBot } from "./src/bot.ts"

const handleUpdate = webhookCallback(bot, "std/http")

// Initialize bot once when the server starts
let botInitialized = false

Deno.serve(async (req) => {
  // Initialize bot on first request
  if (!botInitialized) {
    const success = await initBot()
    if (!success) {
      return new Response("Bot initialization failed", { status: 500 })
    }
    botInitialized = true
  }

  // Handle webhook requests on the secret path (bot token)
  if (req.method === "POST") {
    const url = new URL(req.url)
    if (url.pathname.slice(1) === bot.token) {
      try {
        return await handleUpdate(req)
      } catch (err) {
        console.error(err)
        return new Response("Webhook processing failed", { status: 500 })
      }
    }
  }

  // Health check endpoint
  if (req.method === "GET" && new URL(req.url).pathname === "/health") {
    return new Response("OK", { status: 200 })
  }

  return new Response("Not Found", { status: 404 })
})
