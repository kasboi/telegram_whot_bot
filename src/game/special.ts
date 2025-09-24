import { Card } from '../types/game.ts'

// Special card effect types
export type SpecialCardEffect = {
  type: 'none' | 'pick_cards' | 'skip_turn' | 'extra_turn' | 'general_market' | 'choose_symbol'
  pickAmount?: number
  skipPlayers?: number
  marketCards?: number
}

// Get the special effect of a card
export function getCardEffect(card: Card): SpecialCardEffect {
  if (!card.isSpecial) {
    return { type: 'none' }
  }

  switch (card.number) {
    case 1: // Hold On
      return { type: 'extra_turn' }

    case 2: // Pick Two
      return { type: 'pick_cards', pickAmount: 2 }

    case 5: // Pick Three
      return { type: 'pick_cards', pickAmount: 3 }

    case 8: // Suspension
      return { type: 'skip_turn', skipPlayers: 1 }

    case 14: // General Market
      return { type: 'general_market', marketCards: 1 }

    case 20: // Whot
      return { type: 'choose_symbol' }

    default:
      return { type: 'none' }
  }
}

// Check if a card is stackable with another card
export function canStackCard(newCard: Card, topCard: Card): boolean {
  // Only Pick Two and Pick Three cards can be stacked
  if (!newCard.isSpecial || !topCard.isSpecial) {
    return false
  }

  // Can stack same special card types
  return (newCard.number === 2 && topCard.number === 2) || // Pick Two on Pick Two
    (newCard.number === 5 && topCard.number === 5)    // Pick Three on Pick Three
}

// Check if a card can be played during a pending effect
export function canPlayDuringEffect(card: Card, pendingEffect: { type: 'pick_cards' | 'skip_turn' | 'general_market'; amount: number }): boolean {
  if (pendingEffect.type === 'pick_cards') {
    const effect = getCardEffect(card)
    // Can stack Pick Two or Pick Three cards, or play Whot
    return effect.type === 'pick_cards' || card.number === 20
  }

  // For other pending effects, only Whot can be played
  return card.number === 20
}

// Get card effect description for display
export function getEffectDescription(card: Card): string {
  const effect = getCardEffect(card)

  switch (effect.type) {
    case 'extra_turn':
      return '🔄 Hold On - Play again!'
    case 'pick_cards':
      return `📥 Pick ${effect.pickAmount} - Next player draws ${effect.pickAmount} cards`
    case 'skip_turn':
      return '⏭️ Suspension - Next player skips turn'
    case 'general_market':
      return '🏪 General Market - All other players draw 1 card'
    case 'choose_symbol':
      return '🃏 Whot - Choose new symbol'
    default:
      return ''
  }
}

// Get special card emoji for display
export function getSpecialCardEmoji(card: Card): string {
  if (!card.isSpecial) return ''

  switch (card.number) {
    case 1: return '🔄'  // Hold On
    case 2: return '📥'  // Pick Two
    case 5: return '📥'  // Pick Three  
    case 8: return '⏭️'  // Suspension
    case 14: return '🏪' // General Market
    case 20: return '🃏' // Whot
    default: return ''
  }
}
