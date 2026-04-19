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
import { getSquare, getPropertiesByColor } from '../board/board';
import { hasMonopoly } from '../board/property-group';
import { MAX_HOUSES, HOTEL_LEVEL } from '../constants';
import { findPlayer, adjustBalance, canAfford } from '../player/player';

// Banque : nombre maximal de maisons/hôtels en circulation (règle officielle).
export const BANK_HOUSES_TOTAL = 32;
export const BANK_HOTELS_TOTAL = 12;

/**
 * Compte les maisons et hôtels actuellement placés sur le plateau.
 */
function countBankUsage(properties: readonly OwnedProperty[]): {
  houses: number;
  hotels: number;
} {
  let houses = 0;
  let hotels = 0;
  for (const p of properties) {
    if (p.houses >= 1 && p.houses <= MAX_HOUSES) houses += p.houses;
    else if (p.houses === HOTEL_LEVEL) hotels += 1;
  }
  return { houses, hotels };
}

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

  // Règle de construction uniforme : on ne peut construire sur une propriété
  // que si elle a le moins de bâtiments (ou ex-æquo) dans son groupe.
  const groupProps = getPropertiesByColor(square.color);
  const groupOwned = state.properties.filter(
    (p) =>
      p.ownerId === playerId &&
      groupProps.some((gp) => gp.index === p.squareIndex),
  );
  const minInGroup = groupOwned.reduce(
    (min, p) => (p.houses < min ? p.houses : min),
    HOTEL_LEVEL,
  );
  if (owned.houses > minInGroup) {
    return fail(
      'BUILD_UNEVEN',
      'Construction non équitable : d\'autres propriétés du groupe ont moins de maisons',
    );
  }

  const newLevel = owned.houses + 1;

  // Limites de la banque (32 maisons / 12 hôtels).
  const usage = countBankUsage(state.properties);
  if (newLevel < HOTEL_LEVEL) {
    // On ajoute une maison
    if (usage.houses >= BANK_HOUSES_TOTAL) {
      return fail(
        'NO_HOUSES_IN_BANK',
        'La banque n\'a plus de maisons disponibles',
      );
    }
  } else {
    // Passage en hôtel : on rend 4 maisons et on prend 1 hôtel
    if (usage.hotels >= BANK_HOTELS_TOTAL) {
      return fail(
        'NO_HOTELS_IN_BANK',
        'La banque n\'a plus d\'hôtels disponibles',
      );
    }
  }

  const cost = (square as PropertySquare).houseCost;
  const player = findPlayer(state.players, playerId);
  if (!player) {
    return fail('PLAYER_NOT_FOUND', 'Joueur introuvable');
  }

  if (!canAfford(player, cost)) {
    return fail('INSUFFICIENT_FUNDS', `Fonds insuffisants (besoin de ${cost}€)`);
  }

  return ok({ cost, newLevel });
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
