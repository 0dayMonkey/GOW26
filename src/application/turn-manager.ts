/**
 * TurnManager — Application Layer
 *
 * Machine à états du tour de jeu.
 * Orchestre les transitions entre phases sans aucun import Babylon.js.
 */

import { TurnPhase, type GameState } from '@game-logic/types';
import { type EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';

const VALID_TRANSITIONS: Record<TurnPhase, readonly TurnPhase[]> = {
  [TurnPhase.WAITING_FOR_ROLL]: [TurnPhase.ROLLING],
  [TurnPhase.ROLLING]: [TurnPhase.MOVING],
  [TurnPhase.MOVING]: [TurnPhase.ACTION],
  [TurnPhase.ACTION]: [TurnPhase.BUILDING, TurnPhase.END_TURN],
  [TurnPhase.BUILDING]: [TurnPhase.END_TURN],
  [TurnPhase.END_TURN]: [TurnPhase.WAITING_FOR_ROLL],
};

const logger = Logger.create('TurnManager');

export class TurnManager {
  private state: GameState;
  private readonly eventBus: EventBus;

  constructor(state: GameState, eventBus: EventBus) {
    this.state = state;
    this.eventBus = eventBus;
  }

  /**
   * Phase actuelle.
   */
  getPhase(): TurnPhase {
    return this.state.phase;
  }

  /**
   * Référence au GameState géré.
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Transitions valides depuis la phase actuelle.
   */
  getValidTransitions(): readonly TurnPhase[] {
    return VALID_TRANSITIONS[this.state.phase] ?? [];
  }

  /**
   * Peut-on transitionner vers cette phase ?
   */
  canTransitionTo(target: TurnPhase): boolean {
    return this.getValidTransitions().includes(target);
  }

  /**
   * Effectuer une transition de phase.
   * Throw si la transition est invalide.
   */
  transitionTo(target: TurnPhase): void {
    if (!this.canTransitionTo(target)) {
      const msg = `Transition invalide: ${this.state.phase} → ${target}`;
      logger.error(msg);
      throw new Error(msg);
    }

    const from = this.state.phase;
    this.state.phase = target;
    logger.info(`Phase: ${from} → ${target}`);
  }

  /**
   * Raccourci : effectuer la séquence complète WAITING → ROLLING.
   */
  startRoll(): void {
    this.transitionTo(TurnPhase.ROLLING);
  }

  /**
   * Raccourci : ROLLING → MOVING.
   */
  startMoving(): void {
    this.transitionTo(TurnPhase.MOVING);
  }

  /**
   * Raccourci : MOVING → ACTION.
   */
  startAction(): void {
    this.transitionTo(TurnPhase.ACTION);
  }

  /**
   * Raccourci : ACTION → BUILDING.
   */
  startBuilding(): void {
    this.transitionTo(TurnPhase.BUILDING);
  }

  /**
   * Raccourci : vers END_TURN (depuis ACTION ou BUILDING).
   */
  endTurn(): void {
    this.transitionTo(TurnPhase.END_TURN);
  }

  /**
   * Raccourci : END_TURN → WAITING_FOR_ROLL (prochain tour).
   */
  nextTurn(): void {
    this.transitionTo(TurnPhase.WAITING_FOR_ROLL);
  }

  /**
   * Reset la phase à WAITING_FOR_ROLL (début de partie ou nouveau tour).
   */
  reset(): void {
    this.state.phase = TurnPhase.WAITING_FOR_ROLL;
  }
}
