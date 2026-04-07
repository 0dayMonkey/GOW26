/**
 * Building — Game Logic Layer (Rules)
 *
 * Construction de maisons et hôtels.
 */

import {
  type GameState,
  type PlayerId,
  type OwnedProperty,
  type SquareIndex,
  SquareType,
  type PropertySquare,
  type GameResult,
  ok,
  fail,
} from '../types';
import { getSquare } from '../board/board';
import { hasMonopoly } from '../board/property-group';
import { MAX_HOUSES, HOTEL_LEVEL } from '../constants';
import { findPlayer, adjustBalance, canAfford } from '../player/player';

/**
 * Peut-on construire une maison/hôtel sur cette case ?
 */
export function canBuild(
  squareIndex: SquareIndex,
  playerId: PlayerId,
  state: GameState,
): GameResult<{ cost: number; newLevel: number }> {
  const square = getSquare(squareIndex);

  if (square.type !== SquareType.PROPERTY) {
    return fail('NOT_PROPERTY', 'On ne peut construire que sur une propriété');
  }

  const owned = state.properties.find(
    (p) => p.squareIndex === squareIndex && p.ownerId === playerId,
  );
  if (!owned) {
    return fail('NOT_OWNED', 'Vous ne possédez pas cette propriété');
  }

  if (!hasMonopoly(square.color, playerId, state.properties)) {
    return fail('NO_MONOPOLY', 'Vous devez posséder tout le groupe de couleur');
  }

  if (owned.houses >= HOTEL_LEVEL) {
    return fail('MAX_BUILDINGS', 'Cette propriété a déjà un hôtel');
  }

  const cost = (square as PropertySquare).houseCost;
  const player = findPlayer(state.players, playerId);
  if (!player) {
    return fail('PLAYER_NOT_FOUND', 'Joueur introuvable');
  }

  if (!canAfford(player, cost)) {
    return fail('INSUFFICIENT_FUNDS', `Fonds insuffisants (besoin de ${cost}€)`);
  }

  return ok({ cost, newLevel: owned.houses + 1 });
}

/**
 * Construire une maison/hôtel sur une case.
 * Vérifie les conditions et déduit le coût.
 */
export function buildHouse(
  squareIndex: SquareIndex,
  playerId: PlayerId,
  state: GameState,
): GameResult<{ newLevel: number; cost: number }> {
  const check = canBuild(squareIndex, playerId, state);
  if (!check.success) return check;

  const { cost, newLevel } = check.data;

  const player = findPlayer(state.players, playerId)!;
  adjustBalance(player, -cost);

  const owned = state.properties.find(
    (p) => p.squareIndex === squareIndex && p.ownerId === playerId,
  ) as OwnedProperty;
  owned.houses = newLevel;

  return ok({ newLevel, cost });
}

/**
 * Nombre total de maisons possédées par un joueur (hors hôtels).
 */
export function countPlayerHouses(
  playerId: PlayerId,
  properties: readonly OwnedProperty[],
): number {
  return properties
    .filter((p) => p.ownerId === playerId && p.houses > 0 && p.houses <= MAX_HOUSES)
    .reduce((sum, p) => sum + p.houses, 0);
}

/**
 * Nombre total d'hôtels possédés par un joueur.
 */
export function countPlayerHotels(
  playerId: PlayerId,
  properties: readonly OwnedProperty[],
): number {
  return properties.filter((p) => p.ownerId === playerId && p.houses === HOTEL_LEVEL).length;
}
