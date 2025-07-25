import { createDeck } from './src/game/cards.ts'

// Test deck composition
const deck = createDeck()
console.log(`Total cards in deck: ${deck.length}`)

// Count by symbol
const counts = deck.reduce((acc, card) => {
  acc[card.symbol] = (acc[card.symbol] || 0) + 1
  return acc
}, {} as Record<string, number>)

console.log('\nCard distribution by symbol:')
for (const [symbol, count] of Object.entries(counts)) {
  console.log(`${symbol}: ${count} cards`)
}

// Verify special cards
const specialCards = deck.filter(card => card.isSpecial)
console.log(`\nSpecial cards: ${specialCards.length}`)
specialCards.forEach(card => {
  console.log(`- ${card.symbol} ${card.number}`)
})

// Expected totals according to game rules:
console.log('\n=== VERIFICATION ===')
console.log('Expected: Circles (12), Triangles (12), Crosses (9), Squares (9), Stars (7), Whot (5)')
console.log('Expected total: 54 cards')
console.log(`Actual total: ${deck.length} cards`)
