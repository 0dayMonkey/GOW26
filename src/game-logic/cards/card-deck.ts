/**
 * Card Deck — Game Logic Layer (Cards)
 *
 * Pioche de cartes : tirer la prochaine, remettre dessous, mélanger.
 */

import { type GameState, type CardDefinition, CardType } from '../types';
import { CHANCE_CARDS, COMMUNITY_CARDS } from './card-definitions';

/**
 * Tirer la prochaine carte Chance.
 * Retourne la carte et met à jour le deck (rotation).
 */
export function drawChanceCard(state: GameState): CardDefinition {
  const deck = state.chanceDeck as number[];
  const cardIndex = deck.shift()!;
  deck.push(cardIndex); // Remettre dessous
  return CHANCE_CARDS[cardIndex]!;
}

/**
 * Tirer la prochaine carte Caisse de Communauté.
 */
export function drawCommunityCard(state: GameState): CardDefinition {
  const deck = state.communityDeck as number[];
  const cardIndex = deck.shift()!;
  deck.push(cardIndex);
  return COMMUNITY_CARDS[cardIndex]!;
}

/**
 * Retirer une carte "Sortez de prison" du deck correspondant.
 * (La carte reste hors du deck tant que le joueur la possède)
 */
export function removeGetOutOfJailCard(state: GameState, type: CardType): void {
  const deck = type === CardType.CHANCE
    ? (state.chanceDeck as number[])
    : (state.communityDeck as number[]);

  const idx = deck.indexOf(9);
  if (idx !== -1) {
    deck.splice(idx, 1);
  }
}

/**
 * Remettre une carte "Sortez de prison" dans le deck.
 */
export function returnGetOutOfJailCard(state: GameState, type: CardType): void {
  const deck = type === CardType.CHANCE
    ? (state.chanceDeck as number[])
    : (state.communityDeck as number[]);

  deck.push(9);
}
