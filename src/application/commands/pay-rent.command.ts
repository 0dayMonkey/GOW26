/**
 * PayRentCommand — Application Layer (Commands)
 *
 * Commande serialisable pour le paiement de loyer.
 */

import { type GameState, type GameResult, ok, fail } from '@game-logic/types';
import { getCurrentPlayer, getPropertyOwner } from '@game-logic/state/game-state';
import { calculateRent } from '@game-logic/rules/rent';
import { adjustBalance, findPlayer } from '@game-logic/player/player';
import { type ICommand } from '../command-queue';

export class PayRentCommand implements ICommand {
  readonly type = 'PAY_RENT';
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

    const owner = getPropertyOwner(state, this.squareIndex);
    if (!owner) {
      return fail('NOT_OWNED', 'Cette case n est pas possedee');
    }
    if (owner.ownerId === this.playerId) {
      return fail('OWN_PROPERTY', 'Vous ne pouvez pas vous payer un loyer a vous-meme');
    }

    const dice = state.lastDiceRoll ?? { values: [1, 1] as [number, number], total: 2, isDouble: true };
    const rent = calculateRent(this.squareIndex, this.playerId, state, dice);

    if (rent <= 0) {
      return ok(state); // Pas de loyer a payer
    }

    adjustBalance(player, -rent);

    const ownerPlayer = findPlayer(state.players, owner.ownerId);
    if (ownerPlayer) {
      adjustBalance(ownerPlayer, rent);
    }

    return ok(state);
  }
}
