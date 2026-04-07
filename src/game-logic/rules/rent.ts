/**
 * Rent — Game Logic Layer (Rules)
 *
 * Calcul des loyers pour toutes les cases possédées.
 */

import {
  type GameState,
  type OwnedProperty,
  type DiceRoll,
  SquareType,
  type PropertySquare,
} from '../types';
import { getSquare } from '../board/board';
import { hasMonopoly, countOwnedStations, countOwnedUtilities } from '../board/property-group';
import {
  STATION_RENTS,
  UTILITY_MULTIPLIER_ONE,
  UTILITY_MULTIPLIER_BOTH,
} from '../constants';

/**
 * Calculer le loyer dû sur une case possédée.
 * Retourne 0 si la case n'est pas possédée ou appartient au joueur qui y atterrit.
 */
export function calculateRent(
  squareIndex: number,
  landingPlayerId: string,
  state: GameState,
  diceRoll: DiceRoll,
): number {
  const owned = state.properties.find((p) => p.squareIndex === squareIndex);
  if (!owned) return 0;
  if (owned.ownerId === landingPlayerId) return 0;

  const square = getSquare(squareIndex);

  switch (square.type) {
    case SquareType.PROPERTY:
      return calculatePropertyRent(square, owned, state);
    case SquareType.STATION:
      return calculateStationRent(owned, state);
    case SquareType.UTILITY:
      return calculateUtilityRent(owned, state, diceRoll);
    default:
      return 0;
  }
}

/**
 * Loyer d'une propriété (couleur) : nu, monopole ×2, ou avec bâtiments.
 */
function calculatePropertyRent(
  square: PropertySquare,
  owned: OwnedProperty,
  state: GameState,
): number {
  if (owned.houses > 0) {
    return square.rent[owned.houses] ?? 0;
  }

  const baseRent = square.rent[0] ?? 0;

  if (hasMonopoly(square.color, owned.ownerId, state.properties)) {
    return baseRent * 2;
  }

  return baseRent;
}

/**
 * Loyer d'une gare : dépend du nombre de gares possédées.
 */
function calculateStationRent(owned: OwnedProperty, state: GameState): number {
  const count = countOwnedStations(owned.ownerId, state.properties);
  if (count < 1 || count > 4) return 0;
  return STATION_RENTS[count - 1] ?? 0;
}

/**
 * Loyer d'une compagnie : dépend du nombre de compagnies et du dé.
 */
function calculateUtilityRent(
  owned: OwnedProperty,
  state: GameState,
  diceRoll: DiceRoll,
): number {
  const count = countOwnedUtilities(owned.ownerId, state.properties);
  const multiplier = count >= 2 ? UTILITY_MULTIPLIER_BOTH : UTILITY_MULTIPLIER_ONE;
  return diceRoll.total * multiplier;
}
