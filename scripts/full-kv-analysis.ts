const kv = await Deno.openKv()

console.log("🔍 Full KV Storage Analysis:")
console.log("============================")

// Check all game-related keys
const allKeys = []
for await (const entry of kv.list({ prefix: [] })) {
  allKeys.push({
    key: entry.key,
    keyString: entry.key.join('/'),
    hasValue: !!entry.value
  })
}

console.log(`Total entries in KV: ${allKeys.length}`)
console.log("\nAll keys:")
allKeys.forEach(item => {
  console.log(`- ${item.keyString} (has value: ${item.hasValue})`)
})

// Check specifically for any game states
console.log("\n🎮 Game-related entries:")
for await (const entry of kv.list({ prefix: ["games"] })) {
  const game = entry.value as any
  console.log(`Game ${entry.key[1]}: ${game.state} - ${game.players.length} players - ${game.createdAt}`)
}

for await (const entry of kv.list({ prefix: ["active_games"] })) {
  console.log(`Active game index: ${entry.key[1]}`)
}

for await (const entry of kv.list({ prefix: ["player_games"] })) {
  console.log(`Player ${entry.key[1]} games: ${entry.value}`)
}

await kv.close()
