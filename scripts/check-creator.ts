const kv = await Deno.openKv()
const result = await kv.get(["games", -1002665696422])
const game = result.value as any

console.log(`Creator ID: ${game.creatorId}`)
console.log("Players:")
game.players.forEach((p: any) => console.log(`- ${p.firstName} (${p.id}) ${p.id === game.creatorId ? "👑 CREATOR" : ""}`))
await kv.close()
