/**
 * Card Deck — Game Logic Layer (Cards)
 *
 * Pioche de cartes : tirer la prochaine, remettre dessous, mélanger.
 * La carte "Sortez de prison" (id 9) est retirée du deck quand elle est
 * piochée, et remise dans le deck quand elle est utilisée/rendue.
 */

import { type GameState, type CardDefinition, CardType, CardEffectType } from '../types';
import { CHANCE_CARDS, COMMUNITY_CARDS } from './card-definitions';

/**
 * Tirer la prochaine carte Chance.
 * Retourne la carte et met à jour le deck (rotation).
 * Si c'est la carte "Sortez de prison", elle ne retourne pas dans le deck
 * (le joueur la conserve).
 */
export function drawChanceCard(state: GameState): CardDefinition {
  const deck = state.chanceDeck as number[];
  const cardIndex = deck.shift()!;
  const card = CHANCE_CARDS[cardIndex]!;
  if (card.effect !== CardEffectType.GET_OUT_OF_JAIL) {
    deck.push(cardIndex); // Remettre dessous
  }
  return card;
}

/**
 * Tirer la prochaine carte Caisse de Communauté.
 */
export function drawCommunityCard(state: GameState): CardDefinition {
  const deck = state.communityDeck as number[];
  const cardIndex = deck.shift()!;
  const card = COMMUNITY_CARDS[cardIndex]!;
  if (card.effect !== CardEffectType.GET_OUT_OF_JAIL) {
    deck.push(cardIndex);
  }
  return card;
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
 * Remettre une carte "Sortez de prison" dans le deck (après utilisation).
 * Ne remet la carte que si elle n'y est pas déjà, pour éviter les doublons.
 */
export function returnGetOutOfJailCard(state: GameState, type: CardType): void {
  const deck = type === CardType.CHANCE
    ? (state.chanceDeck as number[])
    : (state.communityDeck as number[]);

  if (!deck.includes(9)) {
    deck.push(9);
  }
}
