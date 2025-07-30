# Extended Downtime Cleanup System

## Overview

Implemented a comprehensive cleanup system to handle cases where the bot is offline for more than 10 minutes. This ensures clean state recovery and prevents stale game sessions from causing issues.

## Components

### 1. Downtime Detection (`src/utils/downtime-cleanup.ts`)

**Key Features:**

- 10-minute threshold for determining "extended downtime"
- Tracks last shutdown time in KV storage
- Automatic cleanup of all game sessions if downtime exceeds threshold

**Functions:**

- `recordShutdownTime()` - Records when bot shuts down
- `checkDowntimeAndCleanup()` - Checks downtime on startup and cleans if needed
- `performCompleteCleanup()` - Removes all game sessions from memory and KV storage
- `clearOrphanedKVEntries()` - Scans and removes orphaned KV entries

### 2. Bot Integration (`src/bot.ts`)

**Startup Sequence:**

1. Check for extended downtime (>10 minutes)
2. If detected, perform complete cleanup of all sessions
3. Skip restart notifications if cleanup was performed
4. Continue with normal bot initialization

**Graceful Shutdown:**

- Registers signal handlers for SIGINT and SIGTERM
- Records shutdown time before stopping
- Handles unexpected exits with beforeunload event

## Usage

The system operates automatically:

1. **On bot shutdown:** Records timestamp
2. **On bot startup:** Checks time difference
3. **If >10 minutes:** Cleans all sessions and skips restart notifications
4. **If <10 minutes:** Normal startup with restart notifications

## Benefits

- **Clean Recovery:** No stale sessions after extended outages
- **User Experience:** No confusing error messages from old game states
- **Memory Management:** Prevents memory leaks from orphaned sessions
- **Automatic Operation:** No manual intervention required

## Integration with Existing Systems

- **Timeouts:** Works alongside lobby (90s) and turn (15s) timeout systems
- **Admin Commands:** Complements admin cleanup commands
- **Persistence:** Integrates with KV storage and memory management
- **Security:** Maintains group-context security for all operations

## Configuration

```typescript
const DOWNTIME_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
```

The threshold can be adjusted based on operational requirements.
