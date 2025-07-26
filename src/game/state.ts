import { GameSession, Player, Card } from '../types/game.ts'
import { logger } from '../utils/logger.ts'
import { createDeck, dealCards, canPlayCardWithChosen } from './cards.ts'
import { getCardEffect, canPlayDuringEffect } from './special.ts'

// Global game state storage (in-memory for MVP)
export const gameState = new Map<number, GameSession>()

export function createGame(groupChatId: number, creatorId: number, creatorName: string): GameSession {
  const newGame: GameSession = {
    id: groupChatId,
    state: 'waiting_for_players',
    creatorId,
    players: [],
    createdAt: new Date()
  }

  gameState.set(groupChatId, newGame)
  logger.info('Game created', {
    groupChatId,
    creatorId,
    creatorName,
    timestamp: new Date().toISOString()
  })
  return newGame
}

export function getGame(groupChatId: number): GameSession | undefined {
  return gameState.get(groupChatId)
}

export function addPlayer(groupChatId: number, userId: number, firstName: string): boolean {
  const game = gameState.get(groupChatId)
  if (!game) {
    logger.warn('Attempted to join non-existent game', { groupChatId, userId })
    return false
  }

  // Allow joining in both waiting_for_players and ready_to_start states
  if (game.state !== 'waiting_for_players' && game.state !== 'ready_to_start') {
    logger.warn('Attempted to join game in invalid state', { groupChatId, userId, gameState: game.state })
    return false
  }

  // Check if player already joined
  if (game.players.some(p => p.id === userId)) {
    logger.warn('Player already joined game', { groupChatId, userId })
    return false
  }

  const newPlayer: Player = {
    id: userId,
    firstName,
    state: 'joined'
  }

  game.players.push(newPlayer)
  logger.info('Player joined game', {
    groupChatId,
    userId,
    firstName,
    totalPlayers: game.players.length,
    playersList: game.players.map(p => p.firstName)
  })

  // Game ready to start if we have 2+ players
  if (game.players.length >= 2) {
    game.state = 'ready_to_start'
    logger.info('Game state: ready_to_start', {
      groupChatId,
      totalPlayers: game.players.length,
      players: game.players.map(p => p.firstName)
    })
  }

  return true
}

export function canStartGame(groupChatId: number, userId: number): boolean {
  const game = gameState.get(groupChatId)
  return game !== undefined &&
    game.state === 'ready_to_start' &&
    game.creatorId === userId &&
    game.players.length >= 2
}

export function clearGame(groupChatId: number): boolean {
  const game = gameState.get(groupChatId)
  if (!game) {
    return false
  }

  gameState.delete(groupChatId)
  logger.info('Game cleared', { groupChatId, state: game.state, players: game.players.length })
  return true
}

export function getGameStats(): { totalGames: number; gameStates: Record<string, number> } {
  const games = Array.from(gameState.values())
  const totalGames = games.length
  const gameStates: Record<string, number> = {}

  games.forEach(game => {
    gameStates[game.state] = (gameStates[game.state] || 0) + 1
  })

  return { totalGames, gameStates }
}

// Stage 2: Start the actual game with cards
export function startGameWithCards(groupChatId: number): boolean {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'ready_to_start') {
    logger.warn('Attempted to start game with cards in invalid state', { groupChatId, gameState: game?.state })
    return false
  }

  // Create and deal cards
  const deck = createDeck()
  const { playerHands, remainingDeck, discardPile } = dealCards(deck, game.players.length)

  // Update game state
  game.state = 'in_progress'
  game.deck = remainingDeck
  game.discardPile = discardPile
  game.lastPlayedCard = discardPile[0] // Set the top card as the last played card
  game.playedCards = [...discardPile] // Initialize played cards with the starting card
  game.currentPlayerIndex = 0
  game.direction = 'clockwise'

  // Assign cards to players and set them as active
  game.players.forEach((player, index) => {
    player.hand = playerHands[index]
    player.state = 'active'
  })

  logger.info('Game state: in_progress', {
    groupChatId,
    totalPlayers: game.players.length,
    cardsInDeck: remainingDeck.length,
    topCard: { id: discardPile[0]?.id, symbol: discardPile[0]?.symbol, number: discardPile[0]?.number },
    currentPlayer: game.players[0]?.firstName,
    playerHands: game.players.map(p => ({ name: p.firstName, cardCount: p.hand?.length || 0 }))
  })

  return true
}

// Get current player
export function getCurrentPlayer(groupChatId: number): Player | undefined {
  const game = gameState.get(groupChatId)
  if (!game || game.currentPlayerIndex === undefined) {
    return undefined
  }

  return game.players[game.currentPlayerIndex]
}

// Get top card from discard pile
export function getTopCard(groupChatId: number) {
  const game = gameState.get(groupChatId)
  if (!game || !game.discardPile || game.discardPile.length === 0) {
    return undefined
  }

  return game.discardPile[game.discardPile.length - 1]
}

// Play a card from player's hand
export function playCard(groupChatId: number, userId: number, cardIndex: number): { success: boolean; message: string; gameEnded?: boolean; winner?: Player; requiresSymbolChoice?: boolean } {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return { success: false, message: "No active game found" }
  }

  const player = game.players.find(p => p.id === userId)
  if (!player) {
    return { success: false, message: "Player not found in this game" }
  }

  if (game.currentPlayerIndex !== game.players.indexOf(player)) {
    return { success: false, message: "It's not your turn" }
  }

  if (!player.hand || cardIndex < 0 || cardIndex >= player.hand.length) {
    return { success: false, message: "Invalid card index" }
  }

  const cardToPlay = player.hand[cardIndex]

  // Check if this is a valid play (considering pending effects)
  const canPlay = game.pendingEffect
    ? canPlayDuringEffect(cardToPlay, game.pendingEffect)
    : canPlayCardWithChosen(cardToPlay, game.lastPlayedCard!, game.chosenSymbol)

  if (!canPlay) {
    const lastCard = game.lastPlayedCard!
    return {
      success: false,
      message: game.pendingEffect
        ? `You must play a card that can stack with the pending ${game.pendingEffect.type} effect`
        : `You can only play a card that matches the symbol (${lastCard.symbol}) or number (${lastCard.number}), or play a Whot card`
    }
  }

  // Remove card from player's hand and add to played cards
  player.hand.splice(cardIndex, 1)
  game.lastPlayedCard = cardToPlay
  if (!game.playedCards) game.playedCards = []
  game.playedCards.push(cardToPlay)

  // Update discard pile to reflect the new top card
  game.discardPile.push(cardToPlay)

  // Handle special card effects
  const effect = getCardEffect(cardToPlay)
  let effectDescription = ''

  if (effect) {
    if (effect.type === 'pick_cards') {
      // If there's already a pending pick effect and this card stacks, add to it
      if (game.pendingEffect && game.pendingEffect.type === 'pick_cards') {
        const previousAmount = game.pendingEffect.amount
        game.pendingEffect.amount += effect.pickAmount!
        effectDescription = `Stacked pick effect: ${previousAmount} + ${effect.pickAmount} = ${game.pendingEffect.amount} cards`
      } else {
        game.pendingEffect = {
          type: 'pick_cards',
          amount: effect.pickAmount!,
          targetPlayerIndex: (game.currentPlayerIndex + 1) % game.players.length
        }
        effectDescription = `Applied pick effect: ${effect.pickAmount} cards to ${game.players[game.pendingEffect.targetPlayerIndex].firstName}`
      }
    } else if (effect.type === 'extra_turn') {
      effectDescription = 'Hold On - Player gets extra turn'
    } else if (effect.type === 'skip_turn') {
      // Skip the next player
      const skippedPlayer = game.players[(game.currentPlayerIndex + 1) % game.players.length]
      game.currentPlayerIndex = (game.currentPlayerIndex + 2) % game.players.length
      effectDescription = `Suspension - Skipped ${skippedPlayer.firstName}'s turn`
    } else if (effect.type === 'general_market') {
      // All other players draw one card
      let playersWhoGotCards = []
      for (let i = 0; i < game.players.length; i++) {
        if (i !== game.currentPlayerIndex) {
          const drawnCard = game.deck!.pop()
          if (drawnCard) {
            game.players[i].hand!.push(drawnCard)
            playersWhoGotCards.push(game.players[i].firstName)
          }
        }
      }
      effectDescription = `General Market - ${playersWhoGotCards.join(', ')} drew cards`
    } else if (effect.type === 'choose_symbol') {
      effectDescription = 'Whot - Requires symbol selection'

      logger.info('Card played', {
        groupChatId,
        player: player.firstName,
        card: { symbol: cardToPlay.symbol, number: cardToPlay.number, id: cardToPlay.id },
        effect: effectDescription,
        remainingCards: player.hand!.length,
        requiresSymbolChoice: true
      })

      return { success: true, message: `Played ${cardToPlay.symbol} ${cardToPlay.number}`, requiresSymbolChoice: true }
    }
  }

  // Check if player won
  if (player.hand!.length === 0) {
    game.state = 'ended'
    game.winner = player
    logger.info('Game ended', {
      groupChatId,
      winner: player.firstName,
      finalPlayerCounts: game.players.map(p => ({ name: p.firstName, cards: p.hand?.length || 0 })),
      totalTurns: game.playedCards?.length || 0
    })
    return { success: true, message: `${player.firstName} wins!`, gameEnded: true, winner: player }
  }

  // Advance turn only if it's not a Hold On card
  let nextPlayer = ''
  if (!effect || effect.type !== 'extra_turn') {
    // If there's a pending effect and the next player must handle it
    if (game.pendingEffect && game.pendingEffect.type === 'pick_cards') {
      game.currentPlayerIndex = game.pendingEffect.targetPlayerIndex!
    } else if (effect?.type !== 'skip_turn') {
      // Normal turn advancement (skip_turn already handled above)
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
    }
    nextPlayer = game.players[game.currentPlayerIndex].firstName
  } else {
    nextPlayer = player.firstName // Same player keeps turn
  }

  logger.info('Card played', {
    groupChatId,
    player: player.firstName,
    card: { symbol: cardToPlay.symbol, number: cardToPlay.number, id: cardToPlay.id },
    effect: effectDescription || 'None',
    remainingCards: player.hand!.length,
    nextPlayer,
    pendingEffect: game.pendingEffect ? `${game.pendingEffect.type}: ${game.pendingEffect.amount}` : 'None'
  })

  const cardDescription = cardToPlay.number === 20 ? 'Whot' : `${cardToPlay.symbol} ${cardToPlay.number}`
  return { success: true, message: `Played ${cardDescription}` }
}

// Draw a card from the deck
export function drawCard(groupChatId: number, userId: number): { success: boolean; message: string; cardDrawn?: Card } {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return { success: false, message: "No active game found" }
  }

  const player = game.players.find(p => p.id === userId)
  if (!player) {
    return { success: false, message: "Player not found in this game" }
  }

  if (game.currentPlayerIndex !== game.players.indexOf(player)) {
    return { success: false, message: "It's not your turn" }
  }

  if (game.deck!.length === 0) {
    logger.error('Deck exhausted during card draw', {
      groupChatId,
      player: player.firstName,
      playersHandSizes: game.players.map(p => ({ name: p.firstName, cards: p.hand?.length || 0 }))
    })
    return { success: false, message: "No more cards in deck" }
  }

  // Handle pending effects first
  if (game.pendingEffect && game.pendingEffect.type === 'pick_cards') {
    // Player must draw the required amount of cards
    const cardsToDraw = game.pendingEffect.amount
    const drawnCards: Card[] = []

    for (let i = 0; i < cardsToDraw && game.deck!.length > 0; i++) {
      const card = game.deck!.pop()!
      player.hand!.push(card)
      drawnCards.push(card)
    }

    // Clear the pending effect and advance turn
    game.pendingEffect = undefined
    const nextPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
    game.currentPlayerIndex = nextPlayerIndex
    const nextPlayer = game.players[nextPlayerIndex]

    logger.info('Penalty cards drawn', {
      groupChatId,
      player: player.firstName,
      cardsDrawn: cardsToDraw,
      newHandSize: player.hand!.length,
      nextPlayer: nextPlayer.firstName,
      reason: 'pending_effect'
    })

    return {
      success: true,
      message: `Drew ${cardsToDraw} cards due to pending effect`,
      cardDrawn: drawnCards[0] // Return first card for display
    }
  }

  // Normal card draw (player choice)
  const drawnCard = game.deck!.pop()!
  player.hand!.push(drawnCard)

  // Log warning if deck is getting low
  if (game.deck!.length <= 5) {
    logger.warn('Deck running low', {
      groupChatId,
      cardsRemaining: game.deck!.length,
      totalPlayersCards: game.players.reduce((sum, p) => sum + (p.hand?.length || 0), 0)
    })
  }

  // Advance turn after drawing a card
  const nextPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
  game.currentPlayerIndex = nextPlayerIndex
  const nextPlayer = game.players[nextPlayerIndex]

  logger.info('Card drawn', {
    groupChatId,
    player: player.firstName,
    cardDrawn: { symbol: drawnCard.symbol, number: drawnCard.number },
    newHandSize: player.hand!.length,
    nextPlayer: nextPlayer.firstName,
    reason: 'voluntary'
  })

  return { success: true, message: "Drew a card", cardDrawn: drawnCard }
}

// Handle Whot symbol selection
export function selectWhotSymbol(groupChatId: number, userId: number, selectedSymbol: string): { success: boolean; message: string } {
  const game = gameState.get(groupChatId)
  if (!game || game.state !== 'in_progress') {
    return { success: false, message: "No active game found" }
  }

  const player = game.players.find(p => p.id === userId)
  if (!player) {
    return { success: false, message: "Player not found in this game" }
  }

  if (game.currentPlayerIndex !== game.players.indexOf(player)) {
    return { success: false, message: "It's not your turn" }
  }

  // Validate symbol
  const validSymbols = ['circle', 'triangle', 'cross', 'square', 'star']
  if (!validSymbols.includes(selectedSymbol)) {
    return { success: false, message: "Invalid symbol selected" }
  }

  // Update the last played card's symbol (treat Whot as having the chosen symbol)
  if (game.lastPlayedCard && game.lastPlayedCard.number === 20) {
    game.chosenSymbol = selectedSymbol

    // Now advance the turn
    const nextPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
    game.currentPlayerIndex = nextPlayerIndex
    const nextPlayer = game.players[nextPlayerIndex]

    logger.info('Whot symbol selected', {
      groupChatId,
      player: player.firstName,
      selectedSymbol,
      nextPlayer: nextPlayer.firstName,
      chosenSymbolActive: true
    })

    return { success: true, message: `Symbol ${selectedSymbol} selected` }
  }

  return { success: false, message: "No Whot card to select symbol for" }
}
