/**
 * CommandQueue — Application Layer
 *
 * File d'attente FIFO pour les commandes de jeu.
 * Chaque commande est exécutée séquentiellement.
 * Pattern Command pour rejouabilité et sérialisation future.
 */

import { type GameState, type GameResult } from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('CommandQueue');

// ─── Interface Command ───────────────────────────────────────────────

export interface ICommand {
  readonly type: string;
  readonly playerId: string;
  readonly timestamp: number;
  execute(state: GameState): GameResult<GameState>;
}

// ─── CommandQueue ────────────────────────────────────────────────────

export class CommandQueue {
  private readonly queue: ICommand[] = [];
  private readonly history: ICommand[] = [];
  private processing = false;

  /**
   * Ajouter une commande à la file.
   */
  enqueue(command: ICommand): void {
    this.queue.push(command);
    logger.debug(`Enqueued: ${command.type} (player: ${command.playerId})`);
  }

  /**
   * Exécuter la prochaine commande de la file.
   * Retourne le résultat ou null si la file est vide.
   */
  processNext(state: GameState): GameResult<GameState> | null {
    if (this.processing) {
      logger.warn('Tentative de processNext pendant un traitement en cours');
      return null;
    }

    const command = this.queue.shift();
    if (!command) return null;

    this.processing = true;

    try {
      logger.info(`Executing: ${command.type} (player: ${command.playerId})`);
      const result = command.execute(state);

      if (result.success) {
        this.history.push(command);
        logger.info(`Success: ${command.type}`);
      } else {
        logger.warn(`Failed: ${command.type} — ${result.error.message}`);
      }

      return result;
    } catch (err: unknown) {
      logger.error(`Exception in command ${command.type}:`, err);
      return {
        success: false,
        error: { code: 'COMMAND_EXCEPTION', message: String(err) },
      };
    } finally {
      this.processing = false;
    }
  }

  /**
   * Exécuter toutes les commandes en attente.
   */
  processAll(state: GameState): GameResult<GameState>[] {
    const results: GameResult<GameState>[] = [];
    let result = this.processNext(state);
    while (result !== null) {
      results.push(result);
      result = this.processNext(state);
    }
    return results;
  }

  /**
   * Nombre de commandes en attente.
   */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Historique des commandes exécutées.
   */
  getHistory(): readonly ICommand[] {
    return this.history;
  }

  /**
   * Vider la file (pas l'historique).
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * Reset complet (file + historique).
   */
  reset(): void {
    this.queue.length = 0;
    this.history.length = 0;
    this.processing = false;
  }
}
