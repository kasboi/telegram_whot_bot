import { Card, WhotSymbol } from '../types/game.ts'

// Official Whot deck composition per game rules
const DECK_COMPOSITION = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8] // Includes the 5th Hold On, Pick Two, Pick Three, and 3rd Suspension
} as const

// Create official Whot deck according to game rules
export function createDeck(): Card[] {
  const deck: Card[] = []
  
  // Add numbered cards for each symbol according to official distribution
  for (const [symbol, numbers] of Object.entries(DECK_COMPOSITION)) {
    for (const number of numbers) {
      deck.push({
        id: `${symbol}_${number}`,
        symbol: symbol as WhotSymbol,
        number,
        isSpecial: isSpecialCard(number)
      })
    }
  }
  
  // Add 5 special Whot cards (wild cards with number 20)
  for (let i = 1; i <= 5; i++) {
    deck.push({
      id: `whot_${i}`,
      symbol: 'whot',
      number: 20,
      isSpecial: true
    })
  }
  
  return deck
}

// Check if a card number represents a special card
function isSpecialCard(number: number): boolean {
  return [1, 2, 5, 8, 14, 20].includes(number)
}// Shuffle deck using Fisher-Yates algorithm
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

// Deal cards to players
export function dealCards(deck: Card[], playerCount: number, cardsPerPlayer: number = 7): {
  playerHands: Card[][],
  remainingDeck: Card[],
  discardPile: Card[]
} {
  const shuffledDeck = shuffleDeck(deck)
  const playerHands: Card[][] = []

  // Initialize empty hands for each player
  for (let i = 0; i < playerCount; i++) {
    playerHands.push([])
  }

  // Deal cards round-robin style
  let cardIndex = 0
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (let player = 0; player < playerCount; player++) {
      if (cardIndex < shuffledDeck.length) {
        playerHands[player].push(shuffledDeck[cardIndex])
        cardIndex++
      }
    }
  }

  // Remaining cards form the draw pile
  const remainingDeck = shuffledDeck.slice(cardIndex + 1) // Skip one card for discard pile
  const discardPile = [shuffledDeck[cardIndex]] // One card starts the discard pile

  return {
    playerHands,
    remainingDeck,
    discardPile
  }
}

// Check if a card can be played on top of another card
export function canPlayCard(cardToPlay: Card, topCard: Card): boolean {
  // Whot cards can always be played
  if (cardToPlay.symbol === 'whot') {
    return true
  }

  // Regular cards: must match symbol or number
  return cardToPlay.symbol === topCard.symbol || cardToPlay.number === topCard.number
}

// Get valid cards that can be played from a hand
export function getValidCards(hand: Card[], topCard: Card): Card[] {
  return hand.filter(card => canPlayCard(card, topCard))
}

// Format card for display
export function formatCard(card: Card): string {
  if (card.symbol === 'whot') {
    return '🃏 Whot (20)'
  }

  const symbolEmojis = {
    circle: '🔴',
    triangle: '🔺',
    cross: '❌',
    square: '🟦',
    star: '⭐'
  }

  return `${symbolEmojis[card.symbol]} ${card.number}`
}

// Get card emoji for buttons
export function getCardEmoji(card: Card): string {
  if (card.symbol === 'whot') {
    return '🃏'
  }

  const symbolEmojis = {
    circle: '🔴',
    triangle: '🔺',
    cross: '❌',
    square: '🟦',
    star: '⭐'
  }

  return symbolEmojis[card.symbol]
}
