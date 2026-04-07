/**
 * RollDiceCommand — Application Layer (Commands)
 *
 * Commande serialisable pour le lancer de des.
 */

import { type GameState, type GameResult, type DiceRoll, ok, fail, TurnPhase } from '@game-logic/types';
import { rollDice } from '@game-logic/rules/dice';
import { getCurrentPlayer } from '@game-logic/state/game-state';
import { type ICommand } from '../command-queue';

export class RollDiceCommand implements ICommand {
  readonly type = 'ROLL_DICE';
  readonly playerId: string;
  readonly timestamp: number;
  private readonly forcedValues?: [number, number];

  constructor(playerId: string, forcedValues?: [number, number]) {
    this.playerId = playerId;
    this.timestamp = Date.now();
    this.forcedValues = forcedValues;
  }

  execute(state: GameState): GameResult<GameState> {
    const player = getCurrentPlayer(state);
    if (player.id !== this.playerId) {
      return fail('WRONG_PLAYER', 'Ce n est pas le tour de ce joueur');
    }
    if (state.phase !== TurnPhase.WAITING_FOR_ROLL) {
      return fail('WRONG_PHASE', `Phase actuelle: ${state.phase}, attendue: WAITING_FOR_ROLL`);
    }

    const dice: DiceRoll = this.forcedValues
      ? { values: this.forcedValues, total: this.forcedValues[0] + this.forcedValues[1], isDouble: this.forcedValues[0] === this.forcedValues[1] }
      : rollDice();

    state.lastDiceRoll = dice;
    return ok(state);
  }
}
