import { Card, WhotSymbol } from '../types/game.ts'

// Whot card symbols
export const SYMBOLS: WhotSymbol[] = ['circle', 'triangle', 'cross', 'square']

// Create a standard 54-card Whot deck
export function createDeck(): Card[] {
  const deck: Card[] = []
  
  // Add numbered cards (1-13) for each symbol
  for (const symbol of SYMBOLS) {
    for (let number = 1; number <= 13; number++) {
      deck.push({
        id: `${symbol}_${number}`,
        symbol,
        number,
        isSpecial: false
      })
    }
  }
  
  // Add 2 special Whot cards (wild cards with number 20)
  deck.push({
    id: 'whot_1',
    symbol: 'whot',
    number: 20,
    isSpecial: true
  })
  
  deck.push({
    id: 'whot_2', 
    symbol: 'whot',
    number: 20,
    isSpecial: true
  })
  
  return deck
}

// Shuffle deck using Fisher-Yates algorithm
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
    square: '🟦'
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
    square: '🟦'
  }
  
  return symbolEmojis[card.symbol]
}
