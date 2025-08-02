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
export function canPlayDuringEffect(card: Card, pendingEffect: { type: 'pick_cards' | 'skip_turn' | 'general_market'; amount: number; cardType?: number }): boolean {
  if (pendingEffect.type === 'pick_cards') {
    // Check if it's a matching pick card
    const effect = getCardEffect(card)
    if (effect.type === 'pick_cards') {
      // If we know what type of card started the effect, only that exact type can counter
      if (pendingEffect.cardType) {
        return card.number === pendingEffect.cardType
      }

      // Fallback: determine by amount (for backward compatibility)
      if (pendingEffect.amount % 2 === 0) {
        // Even amounts suggest Pick Two (2) effects
        return card.number === 2
      } else {
        // Odd amounts suggest Pick Three (5) effects  
        return card.number === 5
      }
    }
    
    // NEW RULE: Whot cards can counter any pick effect
    if (effect.type === 'choose_symbol') {
      return card.number === 20 // Whot (20) can counter Pick 2/Pick 3 effects
    }
    
    return false
  }

  // For other pending effects, no cards can be played - must resolve the effect first
  return false
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
