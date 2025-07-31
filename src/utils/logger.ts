// Environment-aware logging utility
export class Logger {
  private logFile: string
  private isProduction: boolean

  constructor(logFile: string = 'bot.log') {
    this.logFile = logFile
    // Check if running on Deno Deploy (production)
    this.isProduction = !!Deno.env.get('DENO_DEPLOYMENT_ID')
  }

  private async writeLog(level: string, message: string, data?: unknown) {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${level}: ${message}${data ? ` | ${JSON.stringify(data)}` : ''}\n`

    // Always log to console
    console.log(logEntry.trim())

    // Only write to file in development (not on Deno Deploy)
    if (!this.isProduction) {
      try {
        await Deno.writeTextFile(this.logFile, logEntry, { append: true })
      } catch (error) {
        console.error('Failed to write to log file:', error)
      }
    }
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
