/**
 * Jail — Game Logic Layer (Rules)
 *
 * Logique de la prison : entrée, passage de tours, sortie par dé/paiement/carte.
 */

import { type Player, type DiceRoll, type GameResult, ok, fail } from '../types';
import { sendToJail, releaseFromJail, adjustBalance, canAfford } from '../player/player';
import { MAX_JAIL_TURNS, JAIL_FINE } from '../constants';

export enum JailAction {
  ROLL_DOUBLES = 'ROLL_DOUBLES',
  PAY_FINE = 'PAY_FINE',
  USE_CARD = 'USE_CARD',
}

export interface JailResult {
  readonly released: boolean;
  readonly action: JailAction;
  readonly finePaid?: number;
}

/**
 * Envoyer un joueur en prison.
 */
export function jailPlayer(player: Player): void {
  sendToJail(player);
}

/**
 * Tenter de sortir de prison avec un lancer de dés.
 * - Si double → libéré
 * - Si 3ème tour sans double → paye 50€ automatiquement et sort
 */
export function tryRollOutOfJail(player: Player, diceRoll: DiceRoll): JailResult {
  if (diceRoll.isDouble) {
    releaseFromJail(player);
    return { released: true, action: JailAction.ROLL_DOUBLES };
  }

  player.jailTurns++;

  if (player.jailTurns >= MAX_JAIL_TURNS) {
    adjustBalance(player, -JAIL_FINE);
    releaseFromJail(player);
    return { released: true, action: JailAction.PAY_FINE, finePaid: JAIL_FINE };
  }

  return { released: false, action: JailAction.ROLL_DOUBLES };
}

/**
 * Payer l'amende pour sortir de prison.
 */
export function payJailFine(player: Player): GameResult<JailResult> {
  if (!player.inJail) {
    return fail('NOT_IN_JAIL', 'Le joueur n\'est pas en prison');
  }

  if (!canAfford(player, JAIL_FINE)) {
    return fail('INSUFFICIENT_FUNDS', `Fonds insuffisants (besoin de ${JAIL_FINE}€)`);
  }

  adjustBalance(player, -JAIL_FINE);
  releaseFromJail(player);

  return ok({ released: true, action: JailAction.PAY_FINE, finePaid: JAIL_FINE });
}

/**
 * Utiliser une carte "Sortez de prison".
 */
export function useGetOutOfJailCard(player: Player): GameResult<JailResult> {
  if (!player.inJail) {
    return fail('NOT_IN_JAIL', 'Le joueur n\'est pas en prison');
  }

  if (player.getOutOfJailCards <= 0) {
    return fail('NO_CARD', 'Aucune carte "Sortez de prison" disponible');
  }

  player.getOutOfJailCards--;
  releaseFromJail(player);

  return ok({ released: true, action: JailAction.USE_CARD });
}

/**
 * Le joueur peut-il tenter un lancer pour sortir de prison ?
 */
export function canRollInJail(player: Player): boolean {
  return player.inJail && player.jailTurns < MAX_JAIL_TURNS;
}
