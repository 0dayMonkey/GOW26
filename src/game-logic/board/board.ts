/**
 * Board — Game Logic Layer
 *
 * Fonctions de requête sur le plateau : navigation, groupes, filtrage.
 */

import { BOARD_SQUARES, getSquare } from './board-definition';
import { type Square, type PropertySquare, SquareType, type ColorGroup } from '../types';
import { BOARD_SIZE, STATION_INDICES } from '../constants';

/**
 * Toutes les propriétés du plateau (PROPERTY uniquement).
 */
export function getAllProperties(): readonly PropertySquare[] {
  return BOARD_SQUARES.filter(
    (sq): sq is PropertySquare => sq.type === SquareType.PROPERTY,
  );
}

/**
 * Propriétés d'un groupe de couleur.
 */
export function getPropertiesByColor(color: ColorGroup): readonly PropertySquare[] {
  return getAllProperties().filter((p) => p.color === color);
}

/**
 * Nombre de propriétés dans un groupe de couleur.
 */
export function getGroupSize(color: ColorGroup): number {
  return getPropertiesByColor(color).length;
}

/**
 * Case suivante en avançant de `steps` cases (modulo 40).
 */
export function nextPosition(current: number, steps: number): number {
  return ((current + steps) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE;
}

/**
 * Le joueur passe-t-il par la case Départ en allant de `from` à `to` ?
 * (Ne compte pas si on atterrit pile sur Départ — c'est géré séparément)
 */
export function passesGo(from: number, to: number): boolean {
  return to < from && to !== 0;
}

/**
 * Étapes case par case pour aller de `from` en avançant de `steps`.
 * Retourne un tableau d'indices de cases traversées (inclut la destination).
 */
export function getSteps(from: number, steps: number): readonly number[] {
  const result: number[] = [];
  for (let i = 1; i <= Math.abs(steps); i++) {
    if (steps > 0) {
      result.push((from + i) % BOARD_SIZE);
    } else {
      result.push(((from - i) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE);
    }
  }
  return result;
}

/**
 * Gare la plus proche en avançant depuis `from`.
 */
export function nearestStation(from: number): number {
  for (const stationIdx of STATION_INDICES) {
    if (stationIdx > from) return stationIdx;
  }
  // Wrap around → première gare
  return STATION_INDICES[0]!;
}

/**
 * Est-ce une case achetable ? (propriété, gare ou compagnie)
 */
export function isPurchasable(square: Square): boolean {
  return (
    square.type === SquareType.PROPERTY ||
    square.type === SquareType.STATION ||
    square.type === SquareType.UTILITY
  );
}

/**
 * Prix d'achat d'une case achetable. Retourne 0 si non achetable.
 */
export function getPurchasePrice(square: Square): number {
  if (
    square.type === SquareType.PROPERTY ||
    square.type === SquareType.STATION ||
    square.type === SquareType.UTILITY
  ) {
    return square.price;
  }
  return 0;
}

export { getSquare };
