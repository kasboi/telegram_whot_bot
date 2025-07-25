import { createDeck } from './src/game/cards.ts'

const deck = createDeck()
const specialCounts: Record<string, number> = {}

deck.filter(c => c.isSpecial).forEach(c => {
  const key = c.number === 20 ? 'Whot (20)' :
    c.number === 1 ? 'Hold On (1)' :
      c.number === 2 ? 'Pick Two (2)' :
        c.number === 5 ? 'Pick Three (5)' :
          c.number === 8 ? 'Suspension (8)' :
            c.number === 14 ? 'General Market (14)' : String(c.number)
  specialCounts[key] = (specialCounts[key] || 0) + 1
})

console.log('Special card counts:')
Object.entries(specialCounts).forEach(([name, count]) => console.log(`${name}: ${count} cards`))

console.log('\nExpected:')
console.log('Hold On (1): 5 cards')
console.log('Pick Two (2): 5 cards')
console.log('Pick Three (5): 5 cards')
console.log('Suspension (8): 3 cards')
console.log('General Market (14): 4 cards')
console.log('Whot (20): 5 cards')
