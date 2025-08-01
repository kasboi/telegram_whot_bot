/**
 * Environment detection utilities
 */

/**
 * Environment detection utilities
 */

/**
 * Checks if the code is running in production (Deno Deploy)
 * Simple check using DENO_DEPLOYMENT_ID like in logger
 */
export function isProduction(): boolean {
  return !!Deno.env.get('DENO_DEPLOYMENT_ID')
}

/**
 * Checks if the code is running in development mode
 */
export function isDevelopment(): boolean {
  return !isProduction()
}

/**
 * Safe exit function that only exits in development
 * In production, it just logs the exit attempt
 */
export function safeExit(code: number = 0, reason?: string): void {
  if (isDevelopment()) {
    console.log(`🔧 Development mode: Exiting with code ${code}${reason ? ` (${reason})` : ''}`)
    Deno.exit(code)
  } else {
    console.log(`🚀 Production mode: Exit prevented (code ${code}${reason ? `, reason: ${reason}` : ''})`)
  }
}

/**
 * Environment info for logging
 */
export function getEnvironmentInfo(): { 
  mode: 'development' | 'production'
  isMain: boolean
  nodeEnv?: string
  denoEnv?: string
} {
  return {
    mode: isDevelopment() ? 'development' : 'production',
    isMain: import.meta.main === true,
    nodeEnv: Deno.env.get('NODE_ENV'),
    denoEnv: Deno.env.get('DENO_ENV')
  }
}
