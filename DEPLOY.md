# Deno Deploy Setup Guide

## Files Created/Modified

### 1. `main.ts` (NEW)

- Webhook entry point for Deno Deploy
- Handles Telegram webhook requests on secret path (`/{bot_token}`)
- Includes health check endpoint at `/health`
- Initializes bot on first request

### 2. `src/bot.ts` (MODIFIED)

- Exported `bot` instance for webhook usage
- Added `initBot()` function for webhook initialization
- Conditional startup: polling when run directly, webhook when imported
- Preserved graceful shutdown for local development

## Deployment Steps

### For Deno Deploy (GitHub Integration):

1. **Push to GitHub**:

   ```bash
   git add .
   git commit -m "feat: add webhook support for Deno Deploy"
   git push origin main
   ```

2. **Deploy on Deno Deploy**:

   - Go to [Deno Deploy Dashboard](https://dash.deno.com/)
   - Click "New Project"
   - Connect your GitHub repository
   - Select branch: `main`
   - **Entry point**: `main.ts`
   - **Build command**: Leave empty
   - **Install command**: Leave empty

3. **Set Environment Variables**:

   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

4. **Configure Webhook**:
   After deployment, set the webhook URL:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-project>.deno.dev/<YOUR_BOT_TOKEN>"
   ```

## Local Development

### Polling Mode (Current):

```bash
deno task dev
# or
deno task start
```

### Webhook Mode (Testing):

```bash
deno task webhook:dev
# or
deno task webhook
```

## Key Changes

- **Webhook Path**: `/{bot_token}` (secure, as recommended)
- **Health Check**: `/health` endpoint for monitoring
- **Initialization**: Bot initializes on first webhook request
- **Backward Compatibility**: Local polling mode still works
- **Error Handling**: Improved webhook error responses

## Environment Variables

Required:

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token

## Notes

- Bot token is used as the webhook path for security
- KV storage works automatically on Deno Deploy
- All existing functionality (timeouts, admin commands, etc.) preserved
- Graceful shutdown only applies to local polling mode
