/**
 * Dice — Game Logic Layer (Rules)
 *
 * Logique de lancer de dés. Fonctions pures.
 */

import { type DiceRoll } from '../types';

/**
 * Lancer 2 dés. Retourne les valeurs, le total et si c'est un double.
 */
export function rollDice(randomFn?: () => number): DiceRoll {
  const rand = randomFn ?? Math.random;
  const die1 = Math.floor(rand() * 6) + 1;
  const die2 = Math.floor(rand() * 6) + 1;
  return {
    values: [die1, die2],
    total: die1 + die2,
    isDouble: die1 === die2,
  };
}

/**
 * Créer un DiceRoll à partir de valeurs connues (pour les tests/replay).
 */
export function createDiceRoll(die1: number, die2: number): DiceRoll {
  return {
    values: [die1, die2],
    total: die1 + die2,
    isDouble: die1 === die2,
  };
}
