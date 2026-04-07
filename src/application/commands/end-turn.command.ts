/**
 * EndTurnCommand — Application Layer (Commands)
 *
 * Commande serialisable pour la fin de tour.
 */

import { type GameState, type GameResult, ok, fail, TurnPhase } from '@game-logic/types';
import { getCurrentPlayer, advanceToNextPlayer } from '@game-logic/state/game-state';
import { type ICommand } from '../command-queue';

export class EndTurnCommand implements ICommand {
  readonly type = 'END_TURN';
  readonly playerId: string;
  readonly timestamp: number;

  constructor(playerId: string) {
    this.playerId = playerId;
    this.timestamp = Date.now();
  }

  execute(state: GameState): GameResult<GameState> {
    const player = getCurrentPlayer(state);
    if (player.id !== this.playerId) {
      return fail('WRONG_PLAYER', 'Ce n est pas le tour de ce joueur');
    }

    // Reset doubles
    player.doublesCount = 0;

    // Passer au joueur suivant
    advanceToNextPlayer(state);
    state.phase = TurnPhase.WAITING_FOR_ROLL;

    return ok(state);
  }
}
