/**
 * BuildHouseCommand — Application Layer (Commands)
 *
 * Commande serialisable pour la construction d une maison/hotel.
 */

import { type GameState, type GameResult, ok, fail } from '@game-logic/types';
import { getCurrentPlayer } from '@game-logic/state/game-state';
import { buildHouse } from '@game-logic/rules/building';
import { type ICommand } from '../command-queue';

export class BuildHouseCommand implements ICommand {
  readonly type = 'BUILD_HOUSE';
  readonly playerId: string;
  readonly timestamp: number;
  readonly squareIndex: number;

  constructor(playerId: string, squareIndex: number) {
    this.playerId = playerId;
    this.squareIndex = squareIndex;
    this.timestamp = Date.now();
  }

  execute(state: GameState): GameResult<GameState> {
    const player = getCurrentPlayer(state);
    if (player.id !== this.playerId) {
      return fail('WRONG_PLAYER', 'Ce n est pas le tour de ce joueur');
    }

    const result = buildHouse(this.squareIndex, this.playerId, state);
    if (!result.success) {
      return fail(result.error.code, result.error.message);
    }

    return ok(state);
  }
}
