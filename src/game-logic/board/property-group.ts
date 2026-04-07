/**
 * Property Group — Game Logic Layer
 *
 * Logique de groupes de couleurs et détection de monopole.
 */

import { type OwnedProperty, type PlayerId, type ColorGroup, SquareType } from '../types';
import { getPropertiesByColor } from './board';
import { BOARD_SQUARES } from './board-definition';
import { STATION_INDICES, UTILITY_INDICES } from '../constants';

/**
 * Le joueur possède-t-il toutes les propriétés d'un groupe de couleur ?
 */
export function hasMonopoly(
  color: ColorGroup,
  playerId: PlayerId,
  properties: readonly OwnedProperty[],
): boolean {
  const groupProps = getPropertiesByColor(color);
  const ownedInGroup = properties.filter(
    (p) => p.ownerId === playerId && groupProps.some((gp) => gp.index === p.squareIndex),
  );
  return ownedInGroup.length === groupProps.length;
}

/**
 * Nombre de gares possédées par un joueur.
 */
export function countOwnedStations(
  playerId: PlayerId,
  properties: readonly OwnedProperty[],
): number {
  return properties.filter(
    (p) => p.ownerId === playerId && STATION_INDICES.includes(p.squareIndex),
  ).length;
}

/**
 * Nombre de compagnies possédées par un joueur.
 */
export function countOwnedUtilities(
  playerId: PlayerId,
  properties: readonly OwnedProperty[],
): number {
  return properties.filter(
    (p) => p.ownerId === playerId && UTILITY_INDICES.includes(p.squareIndex),
  ).length;
}

/**
 * Le joueur possède-t-il au moins une propriété dans le groupe ?
 */
export function hasGroupMember(
  color: ColorGroup,
  playerId: PlayerId,
  properties: readonly OwnedProperty[],
): boolean {
  const groupProps = getPropertiesByColor(color);
  return properties.some(
    (p) => p.ownerId === playerId && groupProps.some((gp) => gp.index === p.squareIndex),
  );
}

/**
 * Compléterait-il le monopole en achetant cette propriété ?
 */
export function wouldCompleteGroup(
  squareIndex: number,
  playerId: PlayerId,
  properties: readonly OwnedProperty[],
): boolean {
  const square = BOARD_SQUARES[squareIndex];
  if (!square || square.type !== SquareType.PROPERTY) return false;

  const groupProps = getPropertiesByColor(square.color);
  const alreadyOwned = properties.filter(
    (p) => p.ownerId === playerId && groupProps.some((gp) => gp.index === p.squareIndex),
  );

  return alreadyOwned.length === groupProps.length - 1;
}
