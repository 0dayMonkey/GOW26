/**
 * GameController — Application Layer
 *
 * Orchestrateur principal : relie TurnManager, EventBus, GameState et AIController.
 * Attend la fin des animations (dice:animation:complete) avant de continuer.
 * Aucun import Babylon.js.
 */

import {
  type GameState,
  type Player,
  type DiceRoll,
  type OwnedProperty,
  TurnPhase,
  SquareType,
} from '@game-logic/types';
import { createGameState, getCurrentPlayer, advanceToNextPlayer, addOwnedProperty, getPropertyOwner, isGameOver, getWinner } from '@game-logic/state/game-state';
import { rollDice } from '@game-logic/rules/dice';
import { movePlayer } from '@game-logic/rules/movement';
import { calculateRent } from '@game-logic/rules/rent';
import { buildHouse } from '@game-logic/rules/building';
import { tryRollOutOfJail, payJailFine, useGetOutOfJailCard } from '@game-logic/rules/jail';
import { drawChanceCard, drawCommunityCard } from '@game-logic/cards/card-deck';
import { applyCardEffect } from '@game-logic/cards/card-effects';
import { getSquare, isPurchasable, getPurchasePrice } from '@game-logic/board/board';
import { adjustBalance, declareBankrupt, canAfford } from '@game-logic/player/player';
import { MAX_DOUBLES_BEFORE_JAIL } from '@game-logic/constants';
import { type EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';
import { TurnManager } from './turn-manager';
import { AIController } from './ai/ai-controller';

const logger = Logger.create('GameController');

export class GameController {
  private state: GameState;
  private readonly eventBus: EventBus;
  private readonly turnManager: TurnManager;
  private readonly aiController: AIController;
  private lastDice: DiceRoll | null = null;
  private waitingForAnimation = false;

  constructor(players: Player[], eventBus: EventBus) {
    this.state = createGameState(players);
    this.eventBus = eventBus;
    this.turnManager = new TurnManager(this.state, eventBus);
    this.aiController = new AIController(this.state, eventBus, this);

    // Ecouter la fin d animation des des pour continuer le tour
    this.eventBus.on('dice:animation:complete', (data) => {
      if (this.waitingForAnimation) {
        this.waitingForAnimation = false;
        this.continueAfterDiceAnimation();
      }
    });

    logger.info('Partie initialisee', { playerCount: players.length });
  }

  // ─── Accesseurs ────────────────────────────────────────────────

  getState(): GameState {
    return this.state;
  }

  getTurnManager(): TurnManager {
    return this.turnManager;
  }

  getCurrentPlayer(): Player {
    return getCurrentPlayer(this.state);
  }

  // ─── Demarrer la partie ────────────────────────────────────────

  startGame(): void {
    const playerIds = this.state.players.map((p) => p.id);
    this.eventBus.emit('game:started', { playerIds });
    this.eventBus.emit('turn:started', { playerId: this.getCurrentPlayer().id });
    logger.info('Partie demarree');

    this.checkIfAITurn();
  }

  // ─── Actions du joueur ─────────────────────────────────────────

  /**
   * Lancer les des. Les des sont lances, l animation demarre,
   * et on attend dice:animation:complete avant de deplacer le pion.
   */
  handleRollDice(): void {
    const player = this.getCurrentPlayer();
    if (this.turnManager.getPhase() !== TurnPhase.WAITING_FOR_ROLL) {
      logger.warn('Roll ignore: mauvaise phase', { phase: this.turnManager.getPhase() });
      return;
    }
    if (this.waitingForAnimation) {
      logger.warn('Roll ignore: animation en cours');
      return;
    }

    this.turnManager.startRoll();
    const dice = rollDice();
    this.lastDice = dice;
    this.state.lastDiceRoll = dice;

    // Emettre dice:rolled → declenche l animation des des
    // Le deplacement se fera dans continueAfterDiceAnimation()
    this.waitingForAnimation = true;
    this.eventBus.emit('dice:rolled', {
      values: dice.values,
      isDouble: dice.isDouble,
    });
  }

  /**
   * Appele quand l animation des des est terminee.
   * C est ici que le pion se deplace et la case est resolue.
   */
  private continueAfterDiceAnimation(): void {
    const player = this.getCurrentPlayer();
    const dice = this.lastDice!;

    // En prison ?
    if (player.inJail) {
      this.handleJailRoll(player, dice);
      return;
    }

    // 3 doubles → prison
    if (dice.isDouble) {
      player.doublesCount++;
      if (player.doublesCount >= MAX_DOUBLES_BEFORE_JAIL) {
        logger.info('3 doubles consecutifs → prison');
        this.sendPlayerToJail(player);
        this.finishTurn();
        return;
      }
    } else {
      player.doublesCount = 0;
    }

    // Deplacement
    this.turnManager.startMoving();
    const moveResult = movePlayer(player, dice);

    this.eventBus.emit('pawn:moved', {
      playerId: player.id,
      from: moveResult.from,
      to: moveResult.to,
      steps: moveResult.steps,
    });

    if (moveResult.passedGo) {
      this.eventBus.emit('player:balance:changed', {
        playerId: player.id,
        delta: 200,
        newBalance: player.balance,
      });
    }

    if (moveResult.landedOnGoToJail) {
      this.eventBus.emit('player:jailed', { playerId: player.id });
      this.finishTurn();
      return;
    }

    // Resolution de la case
    this.turnManager.startAction();
    this.resolveSquare(player);
  }

  /**
   * Acheter la propriete sur laquelle le joueur se trouve.
   */
  handleBuyProperty(): void {
    const player = this.getCurrentPlayer();
    const square = getSquare(player.position);

    if (!isPurchasable(square)) return;
    if (getPropertyOwner(this.state, player.position)) return;

    const price = getPurchasePrice(square);
    if (!canAfford(player, price)) return;

    adjustBalance(player, -price);
    addOwnedProperty(this.state, player.position, player.id);

    this.eventBus.emit('property:bought', {
      playerId: player.id,
      squareIndex: player.position,
      price,
    });
    this.eventBus.emit('player:balance:changed', {
      playerId: player.id,
      delta: -price,
      newBalance: player.balance,
    });

    logger.info(`${player.name} achete ${square.name} pour ${price}€`);
    this.afterAction();
  }

  /**
   * Decliner l achat de la propriete.
   */
  handleDeclineProperty(): void {
    logger.info(`${this.getCurrentPlayer().name} decline l achat`);
    this.afterAction();
  }

  /**
   * Construire une maison sur une propriete.
   */
  handleBuildHouse(squareIndex: number): void {
    const player = this.getCurrentPlayer();
    const result = buildHouse(squareIndex, player.id, this.state);

    if (result.success) {
      this.eventBus.emit('building:placed', {
        squareIndex,
        buildingType: result.data.newLevel === 5 ? 'hotel' : 'house',
        count: result.data.newLevel,
      });
      this.eventBus.emit('player:balance:changed', {
        playerId: player.id,
        delta: -result.data.cost,
        newBalance: player.balance,
      });
      logger.info(`${player.name} construit sur case ${squareIndex} (niveau ${result.data.newLevel})`);
    }
  }

  /**
   * Payer pour sortir de prison.
   */
  handlePayJailFine(): void {
    const player = this.getCurrentPlayer();
    const result = payJailFine(player);
    if (result.success) {
      this.eventBus.emit('player:released', { playerId: player.id });
      this.eventBus.emit('player:balance:changed', {
        playerId: player.id,
        delta: -50,
        newBalance: player.balance,
      });
    }
  }

  /**
   * Utiliser une carte sortie de prison.
   */
  handleUseJailCard(): void {
    const player = this.getCurrentPlayer();
    const result = useGetOutOfJailCard(player);
    if (result.success) {
      this.eventBus.emit('player:released', { playerId: player.id });
    }
  }

  /**
   * Terminer le tour.
   */
  handleEndTurn(): void {
    const player = this.getCurrentPlayer();
    const phase = this.turnManager.getPhase();

    if (phase === TurnPhase.ACTION || phase === TurnPhase.BUILDING) {
      this.turnManager.endTurn();
    } else if (phase !== TurnPhase.END_TURN) {
      logger.warn('EndTurn ignore: mauvaise phase', { phase });
      return;
    }

    // Double → rejouer (sauf si en prison)
    if (this.lastDice?.isDouble && !player.inJail) {
      logger.info(`${player.name} a fait un double, rejoue`);
      this.turnManager.nextTurn();
      this.eventBus.emit('turn:started', { playerId: player.id });
      this.checkIfAITurn();
      return;
    }

    // Tour suivant
    this.eventBus.emit('turn:ended', { playerId: player.id });
    player.doublesCount = 0;
    advanceToNextPlayer(this.state);

    // Fin de partie ?
    if (isGameOver(this.state)) {
      const winnerId = getWinner(this.state);
      if (winnerId) {
        this.eventBus.emit('game:ended', { winnerId });
        logger.info('Partie terminee', { winnerId });
      }
      return;
    }

    this.turnManager.nextTurn();
    const nextPlayer = this.getCurrentPlayer();
    this.eventBus.emit('turn:started', { playerId: nextPlayer.id });
    logger.info(`Tour de ${nextPlayer.name}`);

    this.checkIfAITurn();
  }

  // ─── Logique interne ───────────────────────────────────────────

  private handleJailRoll(player: Player, dice: DiceRoll): void {
    const result = tryRollOutOfJail(player, dice);

    if (result.released) {
      this.eventBus.emit('player:released', { playerId: player.id });
      if (result.finePaid) {
        this.eventBus.emit('player:balance:changed', {
          playerId: player.id,
          delta: -result.finePaid,
          newBalance: player.balance,
        });
      }

      if (dice.isDouble) {
        this.turnManager.startMoving();
        const moveResult = movePlayer(player, dice);
        this.eventBus.emit('pawn:moved', {
          playerId: player.id,
          from: moveResult.from,
          to: moveResult.to,
          steps: moveResult.steps,
        });
        this.turnManager.startAction();
        this.resolveSquare(player);
        return;
      }
    }

    this.turnManager.startMoving();
    this.turnManager.startAction();
    this.finishTurn();
  }

  private resolveSquare(player: Player): void {
    const square = getSquare(player.position);

    switch (square.type) {
      case SquareType.PROPERTY:
      case SquareType.STATION:
      case SquareType.UTILITY: {
        const owner = getPropertyOwner(this.state, player.position);
        if (!owner) {
          this.eventBus.emit('ui:action:required', {
            type: 'buy-property',
            context: {
              playerId: player.id,
              squareIndex: player.position,
              price: getPurchasePrice(square),
            },
          });
        } else if (owner.ownerId !== player.id) {
          this.payRent(player, owner);
          this.afterAction();
        } else {
          this.afterAction();
        }
        break;
      }

      case SquareType.TAX: {
        const amount = square.amount;
        adjustBalance(player, -amount);
        this.eventBus.emit('player:balance:changed', {
          playerId: player.id,
          delta: -amount,
          newBalance: player.balance,
        });
        this.eventBus.emit('ui:notification', {
          message: `${player.name} paye ${amount}€ de taxes`,
          level: 'warn',
        });
        this.checkBankruptcy(player);
        this.afterAction();
        break;
      }

      case SquareType.CHANCE: {
        const card = drawChanceCard(this.state);
        this.eventBus.emit('card:drawn', { type: 'chance', cardId: card.id });
        const effect = applyCardEffect(card, player, this.state);
        this.handleCardResult(player, effect.balanceChange);
        this.afterAction();
        break;
      }

      case SquareType.COMMUNITY_CHEST: {
        const card = drawCommunityCard(this.state);
        this.eventBus.emit('card:drawn', { type: 'community', cardId: card.id });
        const effect = applyCardEffect(card, player, this.state);
        this.handleCardResult(player, effect.balanceChange);
        this.afterAction();
        break;
      }

      default:
        this.afterAction();
        break;
    }
  }

  private payRent(player: Player, owner: OwnedProperty): void {
    const dice = this.lastDice ?? { values: [1, 1] as [number, number], total: 2, isDouble: true };
    const rent = calculateRent(player.position, player.id, this.state, dice);

    if (rent > 0) {
      adjustBalance(player, -rent);
      const ownerPlayer = this.state.players.find((p) => p.id === owner.ownerId);
      if (ownerPlayer) {
        adjustBalance(ownerPlayer as Player, rent);
        this.eventBus.emit('player:balance:changed', {
          playerId: ownerPlayer.id,
          delta: rent,
          newBalance: ownerPlayer.balance,
        });
      }

      this.eventBus.emit('rent:paid', {
        fromId: player.id,
        toId: owner.ownerId,
        amount: rent,
      });
      this.eventBus.emit('player:balance:changed', {
        playerId: player.id,
        delta: -rent,
        newBalance: player.balance,
      });

      logger.info(`${player.name} paye ${rent}€ de loyer`);
      this.checkBankruptcy(player);
    }
  }

  private handleCardResult(player: Player, balanceChange: number): void {
    if (balanceChange !== 0) {
      this.eventBus.emit('player:balance:changed', {
        playerId: player.id,
        delta: balanceChange,
        newBalance: player.balance,
      });
    }
    this.checkBankruptcy(player);
  }

  private checkBankruptcy(player: Player): void {
    if (player.balance < 0) {
      declareBankrupt(player);
      this.eventBus.emit('player:bankrupt', { playerId: player.id });
      logger.info(`${player.name} est en faillite`);
    }
  }

  private afterAction(): void {
    this.eventBus.emit('ui:action:required', {
      type: 'end-turn',
      context: { playerId: this.getCurrentPlayer().id },
    });
  }

  private finishTurn(): void {
    if (this.turnManager.getPhase() === TurnPhase.ACTION) {
      this.turnManager.endTurn();
    } else if (this.turnManager.getPhase() !== TurnPhase.END_TURN) {
      try { this.turnManager.startAction(); } catch { /* already past */ }
      try { this.turnManager.endTurn(); } catch { /* already there */ }
    }
    this.handleEndTurn();
  }

  private sendPlayerToJail(player: Player): void {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesCount = 0;
    this.eventBus.emit('player:jailed', { playerId: player.id });
  }

  /**
   * Verifie si c est au tour de l IA et declenche son action.
   */
  checkIfAITurn(): void {
    const player = this.getCurrentPlayer();
    if (player.isAI) {
      this.aiController.playTurn();
    }
  }
}
