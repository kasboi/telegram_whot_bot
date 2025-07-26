#!/usr/bin/env -S deno run --allow-read

/**
 * Pretty log viewer for Telegram Whot Bot logs
 * Usage: deno run --allow-read scripts/log-viewer.ts [--follow] [--last N]
 */

interface LogEntry {
  timestamp: string
  level: string
  message: string
  data?: Record<string, unknown>
}

// Color codes for different log levels
const colors = {
  INFO: '\x1b[32m',    // Green
  WARN: '\x1b[33m',    // Yellow
  ERROR: '\x1b[31m',   // Red
  DEBUG: '\x1b[36m',   // Cyan
  reset: '\x1b[0m'     // Reset
}

// Game event emojis
const eventEmojis: Record<string, string> = {
  'Game created': '🎮',
  'Player joined game': '👤',
  'Game started with cards': '🃏',
  'Card play attempted': '🎯',
  'Draw card attempted': '🎴',
  'Hand sent to player': '🤲',
  'Game ready to start': '✅',
  'Starting Whot Game Bot': '🤖',
  'Bot is running': '▶️',
  'Callback query received': '📞',
  'Player.*played': '🎲',
  'drew.*cards': '📥',
  'wins': '🏆',
  'ended': '🏁'
}

function getEventEmoji(message: string): string {
  for (const [pattern, emoji] of Object.entries(eventEmojis)) {
    if (new RegExp(pattern, 'i').test(message)) {
      return emoji
    }
  }
  return '📋'
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatLogLevel(level: string): string {
  const color = colors[level as keyof typeof colors] || colors.reset
  return `${color}${level.padEnd(5)}${colors.reset}`
}

function formatData(data: Record<string, unknown>): string {
  if (!data) return ''

  const formatted: string[] = []

  // Extract key information
  if (data.groupChatId) formatted.push(`Chat: ${data.groupChatId}`)
  if (data.userId && data.firstName) formatted.push(`${data.firstName} (${data.userId})`)
  if (data.userName) formatted.push(`@${data.userName}`)
  if (data.cardCount !== undefined) formatted.push(`Cards: ${data.cardCount}`)
  if (data.totalPlayers) formatted.push(`Players: ${data.totalPlayers}`)
  if (data.topCard) formatted.push(`Top: ${data.topCard}`)
  if (data.currentPlayer) formatted.push(`Turn: ${data.currentPlayer}`)
  if (data.cardId) formatted.push(`Card: ${data.cardId}`)
  if (data.validPlays !== undefined) formatted.push(`Valid: ${data.validPlays}`)
  if (data.isPlayerTurn !== undefined) formatted.push(data.isPlayerTurn ? '🎯 TURN' : '⏳ Wait')
  if (data.cardsInDeck !== undefined) formatted.push(`Deck: ${data.cardsInDeck}`)
  if (data.gameState) formatted.push(`State: ${data.gameState}`)

  return formatted.length > 0 ? `[${formatted.join(' | ')}]` : ''
}

function parseLogLine(line: string): LogEntry | null {
  // Match pattern: [timestamp] LEVEL: message | {json}
  const match = line.match(/^\[([^\]]+)\]\s+(\w+):\s+(.+?)(?:\s+\|\s+(\{.+\}))?$/)
  if (!match) return null

  const [, timestamp, level, message, jsonData] = match
  let data: Record<string, unknown> | undefined

  if (jsonData) {
    try {
      data = JSON.parse(jsonData)
    } catch {
      // If JSON parsing fails, treat as part of message
    }
  }

  return { timestamp, level, message, data }
}

function formatLogEntry(entry: LogEntry): string {
  const time = formatTimestamp(entry.timestamp)
  const level = formatLogLevel(entry.level)
  const emoji = getEventEmoji(entry.message)
  const data = entry.data ? formatData(entry.data) : ''

  let output = `${time} ${level} ${emoji} ${entry.message}`
  if (data) {
    output += `\n    ${colors.reset}${data}${colors.reset}`
  }

  return output
}

async function readLogFile(filename: string): Promise<string[]> {
  try {
    const content = await Deno.readTextFile(filename)
    return content.split('\n').filter(line => line.trim())
  } catch (error) {
    console.error(`Error reading log file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    Deno.exit(1)
  }
}

async function followLog(filename: string): Promise<void> {
  console.log(`📊 Following log file: ${filename}\n`)

  let lastSize = 0

  while (true) {
    try {
      const stat = await Deno.stat(filename)
      if (stat.size > lastSize) {
        const content = await Deno.readTextFile(filename)
        const newLines = content.slice(lastSize).split('\n').filter(line => line.trim())

        for (const line of newLines) {
          const entry = parseLogLine(line)
          if (entry) {
            console.log(formatLogEntry(entry))
          }
        }

        lastSize = stat.size
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(`Error following log: ${error instanceof Error ? error.message : 'Unknown error'}`)
      break
    }
  }
}

async function main() {
  const args = Deno.args
  const follow = args.includes('--follow') || args.includes('-f')
  const help = args.includes('--help') || args.includes('-h')

  let lastCount: number | undefined
  const lastIndex = args.findIndex(arg => arg === '--last' || arg === '-n')
  if (lastIndex !== -1 && lastIndex + 1 < args.length) {
    lastCount = parseInt(args[lastIndex + 1])
  }

  if (help) {
    console.log(`
📊 Telegram Whot Bot Log Viewer

Usage: deno run --allow-read scripts/log-viewer.ts [options]

Options:
  -f, --follow     Follow log file (like tail -f)
  -n, --last N     Show only last N entries
  -h, --help       Show this help

Examples:
  deno run --allow-read scripts/log-viewer.ts
  deno run --allow-read scripts/log-viewer.ts --follow
  deno run --allow-read scripts/log-viewer.ts --last 50
    `)
    Deno.exit(0)
  }

  const logFile = 'bot.log'

  if (follow) {
    await followLog(logFile)
    return
  }

  const lines = await readLogFile(logFile)
  let processLines = lines

  if (lastCount && !isNaN(lastCount)) {
    processLines = lines.slice(-lastCount)
  }

  console.log(`📊 Telegram Whot Bot Logs (${processLines.length} entries)\n`)

  for (const line of processLines) {
    const entry = parseLogLine(line)
    if (entry) {
      console.log(formatLogEntry(entry))
    }
  }
}

if (import.meta.main) {
  main()
}
