const kv = await Deno.openKv()
const games = []
for await (const entry of kv.list({ prefix: ["games"] })) {
  games.push(entry)
}
console.log("Games in KV storage:")
games.forEach(g => {
  const game = g.value as any
  console.log(`- Group ${String(g.key[1])}: ${game.state} (${game.players.length} players)`)
})
await kv.close()
