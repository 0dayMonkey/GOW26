/**
 * AIController — Application Layer
 *
 * Gère le tour de l IA avec des délais simulés pour le rendu visuel.
 * Aucun import Babylon.js.
 */

import { type GameState, type Player, TurnPhase } from '@game-logic/types';
import { type EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';
import { AI_THINK_DELAY_MS } from '@game-logic/constants';
import { evaluatePurchase, evaluateBuilding } from './ai-strategy';

const logger = Logger.create('AIController');

// Référence forward pour éviter les imports circulaires
type GameControllerRef = {
  handleRollDice(): void;
  handleBuyProperty(): void;
  handleDeclineProperty(): void;
  handleBuildHouse(squareIndex: number): void;
  handleEndTurn(): void;
  handlePayJailFine(): void;
  getCurrentPlayer(): Player;
  getTurnManager(): { getPhase(): TurnPhase };
  getState(): GameState;
};

export class AIController {
  private readonly state: GameState;
  private readonly eventBus: EventBus;
  private readonly controller: GameControllerRef;
  private thinking = false;

  constructor(state: GameState, eventBus: EventBus, controller: GameControllerRef) {
    this.state = state;
    this.eventBus = eventBus;
    this.controller = controller;

    // Ecouter les demandes d action UI pour repondre automatiquement
    this.eventBus.on('ui:action:required', (data) => {
      const currentPlayer = this.controller.getCurrentPlayer();
      if (!currentPlayer.isAI) return;
      if (data.context.playerId !== currentPlayer.id) return;

      this.handleActionRequired(data.type, data.context);
    });
  }

  /**
   * Demarrer le tour de l IA.
   */
  playTurn(): void {
    const player = this.controller.getCurrentPlayer();
    if (!player.isAI) return;

    logger.info(`IA ${player.name} commence son tour`);
    this.delayedAction(AI_THINK_DELAY_MS.roll, () => {
      // Si en prison, essayer de payer si possible
      if (player.inJail && player.balance >= 50 && player.jailTurns >= 1) {
        this.controller.handlePayJailFine();
      }
      this.controller.handleRollDice();
    });
  }

  /**
   * Reagir a une demande d action.
   */
  private handleActionRequired(
    actionType: string,
    context: { playerId: string; squareIndex?: number; price?: number },
  ): void {
    const player = this.controller.getCurrentPlayer();

    switch (actionType) {
      case 'buy-property':
        this.handleBuyDecision(player, context.squareIndex ?? 0, context.price ?? 0);
        break;

      case 'end-turn':
        this.handleEndTurnDecision(player);
        break;

      default:
        break;
    }
  }

  /**
   * Decision d achat.
   */
  private handleBuyDecision(player: Player, squareIndex: number, price: number): void {
    this.delayedAction(AI_THINK_DELAY_MS.buy, () => {
      const score = evaluatePurchase(squareIndex, this.state, player.id);
      if (score > 60 && player.balance >= price) {
        logger.info(`IA ${player.name} achete (score: ${score})`);
        this.controller.handleBuyProperty();
      } else {
        logger.info(`IA ${player.name} decline (score: ${score})`);
        this.controller.handleDeclineProperty();
      }
    });
  }

  /**
   * Decision de construction + fin de tour.
   */
  private handleEndTurnDecision(player: Player): void {
    // Essayer de construire d abord
    const buildTargets = evaluateBuilding(this.state, player.id);

    if (buildTargets.length > 0) {
      this.delayedAction(AI_THINK_DELAY_MS.build, () => {
        for (const target of buildTargets) {
          this.controller.handleBuildHouse(target);
        }
        // Puis fin de tour
        this.delayedAction(AI_THINK_DELAY_MS.endTurn, () => {
          this.controller.handleEndTurn();
        });
      });
    } else {
      this.delayedAction(AI_THINK_DELAY_MS.endTurn, () => {
        this.controller.handleEndTurn();
      });
    }
  }

  /**
   * Executer une action apres un delai simule.
   */
  private delayedAction(delayMs: number, action: () => void): void {
    if (this.thinking) return;
    this.thinking = true;

    setTimeout(() => {
      this.thinking = false;
      try {
        action();
      } catch (err: unknown) {
        logger.error('Erreur IA:', err);
        this.thinking = false;
      }
    }, delayMs);
  }
}
