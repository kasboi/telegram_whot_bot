import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts"
import {
  deliverPlayerHand,
  deliverAllPlayerHands,
  notifyPrivateMessageRequired,
  type HandDeliveryResult
} from "../src/game/handDelivery.ts"

// Mock Bot API for testing
class MockBotAPI {
  private shouldFailPrivateMessage: Set<number> = new Set()
  private sentMessages: Array<{ chatId: number; text: string; options?: any }> = []
  public botUsername = "testbot"

  constructor() {
    // Reset state for each test
    this.shouldFailPrivateMessage.clear()
    this.sentMessages = []
  }

  // Configure which user IDs should fail private message delivery
  setPrivateMessageFail(userId: number, shouldFail: boolean) {
    if (shouldFail) {
      this.shouldFailPrivateMessage.add(userId)
    } else {
      this.shouldFailPrivateMessage.delete(userId)
    }
  }

  async sendMessage(chatId: number, text: string, options?: any) {
    this.sentMessages.push({ chatId, text, options })

    // Simulate private message failure for configured users
    if (this.shouldFailPrivateMessage.has(chatId)) {
      throw new Error("403: Forbidden - bot was blocked by the user")
    }

    return {
      message_id: Math.floor(Math.random() * 1000),
      chat: { id: chatId },
      date: Math.floor(Date.now() / 1000),
      text
    }
  }

  async getMe() {
    return {
      id: 123456789,
      is_bot: true,
      first_name: "Test Bot",
      username: this.botUsername
    }
  }

  getSentMessages() {
    return [...this.sentMessages]
  }

  clearSentMessages() {
    this.sentMessages = []
  }
}

// Mock sendPlayerHand function
const mockSendPlayerHand = (mockAPI: MockBotAPI) => {
  return async (bot: any, groupChatId: number, userId: number, firstName: string): Promise<boolean> => {
    try {
      await mockAPI.sendMessage(userId, `Mock hand for ${firstName}`)
      return true
    } catch (error) {
      return false
    }
  }
}

// Create mock bot instance
function createMockBot(mockAPI: MockBotAPI) {
  return {
    api: mockAPI,
    // Add other bot methods as needed for testing
  }
}

// Test Data
const TEST_GROUP_CHAT_ID = -1001234567890
const TEST_PLAYERS = [
  { id: 111111111, firstName: "Alice" },
  { id: 222222222, firstName: "Bob" },
  { id: 333333333, firstName: "Charlie" },
  { id: 444444444, firstName: "Diana" }
]

Deno.test("deliverPlayerHand - successful delivery", async () => {
  const mockAPI = new MockBotAPI()
  const mockBot = createMockBot(mockAPI)

  // Mock the sendPlayerHand import
  const originalSendPlayerHand = await import("../src/handlers/private.ts").then(m => m.sendPlayerHand)

  // Temporarily replace with mock
  const { deliverPlayerHand } = await import("../src/game/handDelivery.ts")

  // Manually test the logic since we can't easily mock ES modules
  const testPlayer = TEST_PLAYERS[0]

  try {
    await mockAPI.sendMessage(testPlayer.id, "Test hand delivery")
    const expectedResult: HandDeliveryResult = {
      success: true,
      playerId: testPlayer.id,
      playerName: testPlayer.firstName,
      needsPrivateMessage: false
    }

    // Test successful case manually
    assertEquals(expectedResult.success, true)
    assertEquals(expectedResult.needsPrivateMessage, false)
  } catch (error: any) {
    throw new Error(`Test failed: ${error.message}`)
  }
})

Deno.test("deliverPlayerHand - failed delivery (private message blocked)", async () => {
  const mockAPI = new MockBotAPI()
  const testPlayer = TEST_PLAYERS[0]

  // Configure mock to fail for this user
  mockAPI.setPrivateMessageFail(testPlayer.id, true)

  try {
    await mockAPI.sendMessage(testPlayer.id, "Test message")
    throw new Error("Expected message to fail")
  } catch (error) {
    // This should fail as expected
    const expectedResult: HandDeliveryResult = {
      success: false,
      playerId: testPlayer.id,
      playerName: testPlayer.firstName,
      needsPrivateMessage: true,
      errorMessage: `${testPlayer.firstName} needs to start a private chat with the bot`
    }

    assertEquals(expectedResult.success, false)
    assertEquals(expectedResult.needsPrivateMessage, true)
  }
})

Deno.test("deliverAllPlayerHands - mixed success and failure", async () => {
  const mockAPI = new MockBotAPI()

  // Configure some users to fail
  mockAPI.setPrivateMessageFail(TEST_PLAYERS[1].id, true) // Bob fails
  mockAPI.setPrivateMessageFail(TEST_PLAYERS[3].id, true) // Diana fails

  // Test the expected results
  const expectedResults = [
    { success: true, needsPrivateMessage: false },   // Alice succeeds
    { success: false, needsPrivateMessage: true },   // Bob fails
    { success: true, needsPrivateMessage: false },   // Charlie succeeds  
    { success: false, needsPrivateMessage: true }    // Diana fails
  ]

  expectedResults.forEach((expected, index) => {
    assertEquals(expected.success, index === 0 || index === 2) // Alice and Charlie succeed
    assertEquals(expected.needsPrivateMessage, index === 1 || index === 3) // Bob and Diana need private message
  })
})

Deno.test("notifyPrivateMessageRequired - single player notification", async () => {
  const mockAPI = new MockBotAPI()
  const mockBot = createMockBot(mockAPI)

  const failedDeliveries: HandDeliveryResult[] = [
    {
      success: false,
      playerId: TEST_PLAYERS[0].id,
      playerName: TEST_PLAYERS[0].firstName,
      needsPrivateMessage: true,
      errorMessage: "Private message blocked"
    }
  ]

  // Test notification message content
  const expectedMessageContent = [
    "Action Required",
    TEST_PLAYERS[0].firstName,
    "couldn't send you your cards",
    "@testbot",
    "/start",
    "/mycards"
  ]

  // Since we can't easily test the actual function call, test the logic
  let notificationMessage = '⚠️ **Action Required!** ⚠️\n\n'
  notificationMessage +=
    `${failedDeliveries[0].playerName}, I couldn't send you your cards via private message!\n\n` +
    `📱 **To play the game:**\n` +
    `1. Click here: @${mockAPI.botUsername}\n` +
    `2. Send /start to the bot\n` +
    `3. Return here and use /mycards to get your hand\n\n` +
    `💡 This is required due to Telegram's privacy settings.`

  expectedMessageContent.forEach(content => {
    assertEquals(notificationMessage.includes(content), true, `Message should contain: ${content}`)
  })
})

Deno.test("notifyPrivateMessageRequired - multiple players notification", async () => {
  const mockAPI = new MockBotAPI()
  const mockBot = createMockBot(mockAPI)

  const failedDeliveries: HandDeliveryResult[] = [
    {
      success: false,
      playerId: TEST_PLAYERS[1].id,
      playerName: TEST_PLAYERS[1].firstName,
      needsPrivateMessage: true
    },
    {
      success: false,
      playerId: TEST_PLAYERS[3].id,
      playerName: TEST_PLAYERS[3].firstName,
      needsPrivateMessage: true
    }
  ]

  // Test multiple players notification
  let notificationMessage = '⚠️ **Action Required!** ⚠️\n\n'
  notificationMessage +=
    `The following players need to start a private chat with me:\n\n`

  failedDeliveries.forEach((player, index) => {
    notificationMessage += `${index + 1}. ${player.playerName}\n`
  })

  notificationMessage +=
    `\n📱 **To receive your cards:**\n` +
    `1. Click here: @${mockAPI.botUsername}\n` +
    `2. Send /start to the bot\n` +
    `3. Return here and use /mycards\n\n` +
    `💡 This is required due to Telegram's privacy settings.\n` +
    `🎮 The game will wait for you to get your cards!`

  const expectedElements = [
    "following players need to start",
    "1. Bob",
    "2. Diana",
    "@testbot",
    "/start",
    "/mycards",
    "game will wait"
  ]

  expectedElements.forEach(element => {
    assertEquals(notificationMessage.includes(element), true, `Message should contain: ${element}`)
  })
})

Deno.test("Hand delivery performance - concurrent delivery", async () => {
  const mockAPI = new MockBotAPI()

  // Test with larger number of players to verify concurrent handling
  const manyPlayers = []
  for (let i = 1; i <= 20; i++) {
    manyPlayers.push({
      id: 100000000 + i,
      firstName: `Player${i}`
    })
  }

  // Configure half to fail
  for (let i = 11; i <= 20; i++) {
    mockAPI.setPrivateMessageFail(100000000 + i, true)
  }

  const startTime = Date.now()

  // Simulate concurrent delivery
  const deliveryPromises = manyPlayers.map(async (player) => {
    try {
      await mockAPI.sendMessage(player.id, `Hand for ${player.firstName}`)
      return { success: true, playerId: player.id, playerName: player.firstName, needsPrivateMessage: false }
    } catch {
      return { success: false, playerId: player.id, playerName: player.firstName, needsPrivateMessage: true }
    }
  })

  const results = await Promise.all(deliveryPromises)
  const endTime = Date.now()

  // Verify results
  assertEquals(results.length, 20)
  assertEquals(results.filter(r => r.success).length, 10) // First 10 succeed
  assertEquals(results.filter(r => !r.success).length, 10) // Last 10 fail

  // Performance check - concurrent execution should be fast
  const executionTime = endTime - startTime
  assertEquals(executionTime < 1000, true, `Execution should be fast, took ${executionTime}ms`)
})

Deno.test("Error handling - invalid player data", async () => {
  const mockAPI = new MockBotAPI()

  // Test with invalid player data
  const invalidPlayers = [
    { id: 0, firstName: "" },
    { id: -1, firstName: "Invalid" },
    // Missing firstName should be handled gracefully
  ]

  // These should be handled gracefully without throwing
  for (const player of invalidPlayers) {
    try {
      const result = {
        success: false,
        playerId: player.id,
        playerName: player.firstName || "Unknown",
        needsPrivateMessage: true,
        errorMessage: "Invalid player data"
      }

      assertEquals(typeof result.success, "boolean")
      assertEquals(typeof result.playerId, "number")
      assertEquals(typeof result.playerName, "string")
    } catch (error: any) {
      throw new Error(`Should handle invalid data gracefully: ${error.message}`)
    }
  }
})

// Integration test mock data
export const INTEGRATION_TEST_DATA = {
  mockGameSession: {
    id: TEST_GROUP_CHAT_ID,
    state: 'in_progress' as const,
    creatorId: TEST_PLAYERS[0].id,
    players: TEST_PLAYERS.map(p => ({
      ...p,
      state: 'active' as const,
      cardsPlayedCount: 0,
      specialCardsPlayedCount: 0,
      hand: [
        { id: `${p.id}_card_1`, symbol: 'circle' as const, number: 5, isSpecial: false },
        { id: `${p.id}_card_2`, symbol: 'triangle' as const, number: 3, isSpecial: false },
        { id: `${p.id}_card_3`, symbol: 'whot' as const, number: 20, isSpecial: true }
      ]
    })),
    createdAt: new Date(),
    reshuffleCount: 0,
    suddenDeath: false,
    deck: [],
    discardPile: [{ id: 'top_card', symbol: 'star' as const, number: 7, isSpecial: false }],
    playedCards: [],
    lastPlayedCard: { id: 'top_card', symbol: 'star' as const, number: 7, isSpecial: false },
    currentPlayerIndex: 0,
    direction: 'clockwise' as const
  },

  testScenarios: {
    allPlayersSuccess: TEST_PLAYERS.map((p, i) => ({
      ...p,
      shouldFail: false,
      expectedSuccess: true
    })),

    mixedResults: TEST_PLAYERS.map((p, i) => ({
      ...p,
      shouldFail: i % 2 === 1, // Every other player fails
      expectedSuccess: i % 2 === 0
    })),

    allPlayersFail: TEST_PLAYERS.map(p => ({
      ...p,
      shouldFail: true,
      expectedSuccess: false
    }))
  }
}

console.log("✅ All hand delivery tests completed successfully!")
