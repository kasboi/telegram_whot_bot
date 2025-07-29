// Simple file logging utility for JSON output
export class JsonLogger {
  private logFile: string

  constructor(logFile: string = "bot.log.json") {
    this.logFile = logFile
  }

  private async writeLog(level: string, message: string, data?: unknown) {
    const timestamp = new Date().toISOString()
    const logEntry: Record<string, unknown> = {
      timestamp,
      level,
      message,
    }
    if (data !== undefined) {
      logEntry.data = data
    }

    const logString = `${JSON.stringify(logEntry)}\n`

    try {
      await Deno.writeTextFile(this.logFile, logString, { append: true })
    } catch (error) {
      console.error("Failed to write to JSON log file:", error)
    }

    // For console, we can still log the pretty version for readability
    console.log(logString.trim())
  }

  async info(message: string, data?: unknown) {
    await this.writeLog("INFO", message, data)
  }

  async error(message: string, data?: unknown) {
    await this.writeLog("ERROR", message, data)
  }

  async debug(message: string, data?: unknown) {
    await this.writeLog("DEBUG", message, data)
  }

  async warn(message: string, data?: unknown) {
    await this.writeLog("WARN", message, data)
  }
}

// Global JSON logger instance
export const jsonLogger = new JsonLogger()
