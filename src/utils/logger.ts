// Simple file logging utility
export class Logger {
  private logFile: string

  constructor(logFile: string = 'bot.log') {
    this.logFile = logFile
  }

  private async writeLog(level: string, message: string, data?: unknown) {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${level}: ${message}${data ? ` | ${JSON.stringify(data)}` : ''}\n`

    try {
      await Deno.writeTextFile(this.logFile, logEntry, { append: true })
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }

    // Also log to console for development
    console.log(logEntry.trim())
  }

  async info(message: string, data?: unknown) {
    await this.writeLog('INFO', message, data)
  }

  async error(message: string, data?: unknown) {
    await this.writeLog('ERROR', message, data)
  }

  async debug(message: string, data?: unknown) {
    await this.writeLog('DEBUG', message, data)
  }

  async warn(message: string, data?: unknown) {
    await this.writeLog('WARN', message, data)
  }
}

// Global logger instance
export const logger = new Logger()
