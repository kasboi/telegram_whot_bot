const kv = await Deno.openKv()

// Get the specific game that's causing issues
const gameKey = ["games", -1002665696422]
const result = await kv.get(gameKey)

if (result.value) {
  const game = result.value as any
  console.log("🔍 Detailed Game Analysis:")
  console.log("========================")
  console.log(`Group ID: ${game.id}`)
  console.log(`State: ${game.state}`)
  console.log(`Created: ${new Date(game.createdAt)}`)
  console.log(`Players: ${game.players.length}`)

  game.players.forEach((player: any, i: number) => {
    console.log(`  ${i + 1}. ${player.firstName} (${player.id}) - State: ${player.state}`)
    if (player.hand) {
      console.log(`     Hand: ${player.hand.length} cards`)
    }
  })

  console.log(`Current Player Index: ${game.currentPlayerIndex}`)
  console.log(`Has Deck: ${!!game.deck} (${game.deck?.length || 0} cards)`)
  console.log(`Has Discard Pile: ${!!game.discardPile} (${game.discardPile?.length || 0} cards)`)
  console.log(`Last Played Card: ${game.lastPlayedCard ? `${game.lastPlayedCard.symbol} ${game.lastPlayedCard.number}` : 'None'}`)
  console.log(`Direction: ${game.direction || 'Not set'}`)
  console.log(`Reshuffle Count: ${game.reshuffleCount}`)
  console.log(`Sudden Death: ${game.suddenDeath}`)
  console.log(`Chosen Symbol: ${game.chosenSymbol || 'None'}`)
  console.log(`Pending Effect: ${game.pendingEffect ? JSON.stringify(game.pendingEffect) : 'None'}`)
} else {
  console.log("❌ Game not found in KV storage")
}

await kv.close()
