/**
 * Main persistence module - exports the unified interface
 */

export { KVGameStore } from './kvStore.ts'
export { PersistenceManager } from './manager.ts'
export type { GameStore, PersistenceResult } from './types.ts'

// Re-export the manager as the default persistence solution
export { PersistenceManager as GamePersistence } from './manager.ts'
