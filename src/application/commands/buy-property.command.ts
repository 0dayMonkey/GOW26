/**
 * BuyPropertyCommand — Application Layer (Commands)
 *
 * Commande serialisable pour l achat d une propriete.
 */

import { type GameState, type GameResult, ok, fail } from '@game-logic/types';
import { getCurrentPlayer, getPropertyOwner, addOwnedProperty } from '@game-logic/state/game-state';
import { getSquare, isPurchasable, getPurchasePrice } from '@game-logic/board/board';
import { adjustBalance, canAfford } from '@game-logic/player/player';
import { type ICommand } from '../command-queue';

export class BuyPropertyCommand implements ICommand {
  readonly type = 'BUY_PROPERTY';
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

    const square = getSquare(this.squareIndex);
    if (!isPurchasable(square)) {
      return fail('NOT_PURCHASABLE', 'Cette case n est pas achetable');
    }

    if (getPropertyOwner(state, this.squareIndex)) {
      return fail('ALREADY_OWNED', 'Cette propriete est deja possedee');
    }

    const price = getPurchasePrice(square);
    if (!canAfford(player, price)) {
      return fail('INSUFFICIENT_FUNDS', `Fonds insuffisants (besoin de ${price}€)`);
    }

    adjustBalance(player, -price);
    addOwnedProperty(state, this.squareIndex, player.id);

    return ok(state);
  }
}
