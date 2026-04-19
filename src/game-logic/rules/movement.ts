/**
 * Movement — Game Logic Layer (Rules)
 *
 * Déplacement des joueurs sur le plateau.
 */

import { type Player, type DiceRoll } from '../types';
import { nextPosition, passesGo, getSteps } from '../board/board';
import { moveTo, adjustBalance, sendToJail } from '../player/player';
import { GO_SALARY, GO_TO_JAIL_SQUARE, BOARD_SIZE } from '../constants';

export interface MoveResult {
  readonly from: number;
  readonly to: number;
  readonly steps: readonly number[];
  readonly passedGo: boolean;
  readonly landedOnGoToJail: boolean;
}

/**
 * Déplacer un joueur selon un lancer de dés.
 * Gère le passage par la case Départ et le "Va en Prison".
 */
export function movePlayer(player: Player, diceRoll: DiceRoll): MoveResult {
  const from = player.position;
  const to = nextPosition(from, diceRoll.total);
  const steps = getSteps(from, diceRoll.total);
  const didPassGo = passesGo(from, to);

  // Passage par Départ → +200€
  if (didPassGo) {
    adjustBalance(player, GO_SALARY);
  }

  // Atterrit pile sur Départ → +200€ aussi
  if (to === 0 && from !== 0) {
    adjustBalance(player, GO_SALARY);
  }

  moveTo(player, to);

  // Va en Prison ?
  const landedOnGoToJail = to === GO_TO_JAIL_SQUARE;
  if (landedOnGoToJail) {
    sendToJail(player);
  }

  return { from, to, steps, passedGo: didPassGo || to === 0, landedOnGoToJail };
}

/**
 * Déplacer un joueur vers une case précise (cartes Chance/CC).
 * Gère le passage par Départ si on avance.
 */
export function movePlayerTo(player: Player, destination: number): MoveResult {
  const from = player.position;

  // Calculer si on passe par Départ (on avance toujours dans le sens horaire)
  const didPassGo = destination < from && destination !== 0;

  if (didPassGo) {
    adjustBalance(player, GO_SALARY);
  }
  if (destination === 0 && from !== 0) {
    adjustBalance(player, GO_SALARY);
  }

  // Calculer les étapes
  let stepCount: number;
  if (destination >= from) {
    stepCount = destination - from;
  } else {
    stepCount = BOARD_SIZE - from + destination;
  }
  const steps = getSteps(from, stepCount);

  moveTo(player, destination);

  const landedOnGoToJail = destination === GO_TO_JAIL_SQUARE;
  if (landedOnGoToJail) {
    sendToJail(player);
  }

  return { from, to: destination, steps, passedGo: didPassGo || destination === 0, landedOnGoToJail };
}

/**
 * Reculer un joueur d'un certain nombre de cases (cartes).
 * Pas de passage par Départ en reculant.
 */
export function movePlayerBack(player: Player, count: number): MoveResult {
  const from = player.position;
  const to = ((from - count) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE;
  const steps = getSteps(from, -count);

  moveTo(player, to);

  const landedOnGoToJail = to === GO_TO_JAIL_SQUARE;
  if (landedOnGoToJail) {
    sendToJail(player);
  }

  return { from, to, steps, passedGo: false, landedOnGoToJail };
}
