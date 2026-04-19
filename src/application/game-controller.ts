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
  type PlayerId,
  type DiceRoll,
  type OwnedProperty,
  TurnPhase,
  SquareType,
} from '@game-logic/types';
import {
  createGameState,
  getCurrentPlayer,
  advanceToNextPlayer,
  addOwnedProperty,
  getPropertyOwner,
  isGameOver,
  getWinner,
  transferBankruptAssets,
} from '@game-logic/state/game-state';
import { rollDice } from '@game-logic/rules/dice';
import { movePlayer } from '@game-logic/rules/movement';
import { calculateRent } from '@game-logic/rules/rent';
import { buildHouse } from '@game-logic/rules/building';
import { tryRollOutOfJail, payJailFine, useGetOutOfJailCard } from '@game-logic/rules/jail';
import { drawChanceCard, drawCommunityCard } from '@game-logic/cards/card-deck';
import { applyCardEffect } from '@game-logic/cards/card-effects';
import { getSquare, isPurchasable, getPurchasePrice } from '@game-logic/board/board';
import { adjustBalance, declareBankrupt, canAfford } from '@game-logic/player/player';
import { MAX_DOUBLES_BEFORE_JAIL, JAIL_SQUARE, GO_SALARY } from '@game-logic/constants';
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
  private waitingForDiceAnimation = false;
  private waitingForPawnAnimation = false;
  private escapedJailByDoubleThisTurn = false;
  private pendingAfterPawnAction: (() => void) | null = null;

  constructor(players: Player[], eventBus: EventBus) {
    this.state = createGameState(players);
    this.eventBus = eventBus;
    this.turnManager = new TurnManager(this.state);
    this.aiController = new AIController(this.state, eventBus, this);

    // Ecouter la fin d animation des des pour continuer le tour
    this.eventBus.on('dice:animation:complete', () => {
      if (this.waitingForDiceAnimation) {
        this.waitingForDiceAnimation = false;
        this.continueAfterDiceAnimation();
      }
    });

    // Ecouter la fin d animation du pion pour résoudre la case visuellement
    this.eventBus.on('pawn:animation:complete', () => {
      if (this.waitingForPawnAnimation && this.pendingAfterPawnAction) {
        this.waitingForPawnAnimation = false;
        const action = this.pendingAfterPawnAction;
        this.pendingAfterPawnAction = null;
        action();
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
    if (this.turnManager.getPhase() !== TurnPhase.WAITING_FOR_ROLL) {
      logger.warn('Roll ignore: mauvaise phase', { phase: this.turnManager.getPhase() });
      return;
    }
    if (this.waitingForDiceAnimation || this.waitingForPawnAnimation) {
      logger.warn('Roll ignore: animation en cours');
      return;
    }

    this.turnManager.startRoll();
    const dice = rollDice();
    this.lastDice = dice;
    this.state.lastDiceRoll = dice;

    // Emettre dice:rolled → declenche l animation des des
    // Le deplacement se fera dans continueAfterDiceAnimation()
    this.waitingForDiceAnimation = true;
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
        delta: GO_SALARY,
        newBalance: player.balance,
      });
    }

    if (moveResult.landedOnGoToJail) {
      this.eventBus.emit('player:jailed', { playerId: player.id });
      // On attend la fin de l'animation du pion avant de passer au tour suivant
      this.scheduleAfterPawnAnimation(() => this.finishTurn());
      return;
    }

    // Resolution de la case APRÈS l'animation du pion (pour que le joueur voie
    // bien le pion arriver avant d'être sollicité pour acheter/payer/etc.)
    this.scheduleAfterPawnAnimation(() => {
      this.turnManager.startAction();
      this.resolveSquare(player);
    });
  }

  /**
   * Exécute une action après que l'animation du pion soit terminée.
   * Si rien n'écoute pawn:animation:complete (ex. tests), exécute immédiatement.
   */
  private scheduleAfterPawnAnimation(action: () => void): void {
    if (this.eventBus.listenerCount('pawn:animation:complete') === 0) {
      // Personne n'animera le pion → pas d'événement attendu
      action();
      return;
    }
    this.waitingForPawnAnimation = true;
    this.pendingAfterPawnAction = action;
  }

  /**
   * Acheter la propriete sur laquelle le joueur se trouve.
   */
  handleBuyProperty(): void {
    if (this.turnManager.getPhase() !== TurnPhase.ACTION) {
      logger.warn('Buy ignore: mauvaise phase', { phase: this.turnManager.getPhase() });
      return;
    }
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
    const result = useGetOutOfJailCard(player, this.state);
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

    if (
      phase === TurnPhase.ACTION ||
      phase === TurnPhase.BUILDING ||
      phase === TurnPhase.MOVING ||
      phase === TurnPhase.ROLLING
    ) {
      this.turnManager.endTurn();
    } else if (phase !== TurnPhase.END_TURN) {
      logger.warn('EndTurn ignore: mauvaise phase', { phase });
      return;
    }

    // Double → rejouer, SAUF si :
    //  - le joueur est maintenant en prison (3 doubles ou carte Aller-en-prison)
    //  - le joueur vient juste de sortir de prison par double (règle officielle)
    const canRollAgain =
      this.lastDice?.isDouble &&
      !player.inJail &&
      !this.escapedJailByDoubleThisTurn;

    if (canRollAgain) {
      logger.info(`${player.name} a fait un double, rejoue`);
      this.eventBus.emit('turn:ended', { playerId: player.id });
      this.turnManager.nextTurn();
      this.eventBus.emit('turn:started', { playerId: player.id });
      this.checkIfAITurn();
      return;
    }

    // Tour suivant
    this.eventBus.emit('turn:ended', { playerId: player.id });
    player.doublesCount = 0;
    this.escapedJailByDoubleThisTurn = false;
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
        // Sortie de prison par double : on se déplace, MAIS pas de tour supplémentaire
        this.escapedJailByDoubleThisTurn = true;
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
            delta: GO_SALARY,
            newBalance: player.balance,
          });
        }
        if (moveResult.landedOnGoToJail) {
          this.eventBus.emit('player:jailed', { playerId: player.id });
          this.scheduleAfterPawnAnimation(() => this.finishTurn());
          return;
        }
        this.scheduleAfterPawnAnimation(() => {
          this.turnManager.startAction();
          this.resolveSquare(player);
        });
        return;
      }
      // Sortie sans double (paiement forcé au 3ème tour) : fin de tour
      this.finishTurn();
      return;
    }

    // Toujours en prison : on termine le tour
    this.finishTurn();
  }

  private resolveSquare(player: Player, cardDepth: number = 0): void {
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
          // Si le joueur a fait faillite via le loyer, on ne propose pas "fin de tour"
          if (!player.isBankrupt) this.afterAction();
        } else {
          this.afterAction();
        }
        break;
      }

      case SquareType.TAX: {
        const amount = square.amount;
        const actuallyPaid = Math.min(amount, Math.max(0, player.balance));
        adjustBalance(player, -actuallyPaid);
        this.eventBus.emit('player:balance:changed', {
          playerId: player.id,
          delta: -actuallyPaid,
          newBalance: player.balance,
        });
        this.eventBus.emit('ui:notification', {
          message: `${player.name} paye ${actuallyPaid}€ de taxes`,
          level: 'warn',
        });
        if (actuallyPaid < amount) {
          // Faillite vers la banque
          this.declareBankruptcy(player, null);
        }
        if (!player.isBankrupt) this.afterAction();
        break;
      }

      case SquareType.CHANCE: {
        const card = drawChanceCard(this.state);
        this.eventBus.emit('card:drawn', { type: 'chance', cardId: card.id });
        this.applyCardAndResolve(player, card, cardDepth);
        break;
      }

      case SquareType.COMMUNITY_CHEST: {
        const card = drawCommunityCard(this.state);
        this.eventBus.emit('card:drawn', { type: 'community', cardId: card.id });
        this.applyCardAndResolve(player, card, cardDepth);
        break;
      }

      default:
        this.afterAction();
        break;
    }
  }

  /**
   * Applique l'effet d'une carte, émet les événements, et re-résout la case
   * d'arrivée si la carte a déplacé le joueur (pour payer loyer, proposer achat, etc.)
   */
  private applyCardAndResolve(
    player: Player,
    card: ReturnType<typeof drawChanceCard>,
    cardDepth: number,
  ): void {
    const posBefore = player.position;
    const effect = applyCardEffect(card, player, this.state);
    this.handleCardResult(player, effect.balanceChange);

    if (player.isBankrupt) {
      return;
    }

    // Si la carte envoie en prison : fin de tour
    if (effect.jailed) {
      this.eventBus.emit('player:jailed', { playerId: player.id });
      this.finishTurn();
      return;
    }

    // Si la carte a déplacé le joueur, émettre pawn:moved et re-résoudre la case
    if (effect.moved && player.position !== posBefore) {
      this.eventBus.emit('pawn:moved', {
        playerId: player.id,
        from: posBefore,
        to: player.position,
        steps: [player.position],
      });
      // Limiter la récursion (carte qui envoie vers une autre carte)
      if (cardDepth >= 3) {
        logger.warn('Profondeur de cartes atteinte, on arrête la résolution');
        this.afterAction();
        return;
      }
      this.scheduleAfterPawnAnimation(() => {
        this.resolveSquare(player, cardDepth + 1);
      });
      return;
    }

    this.afterAction();
  }

  private payRent(player: Player, owner: OwnedProperty): void {
    const dice = this.lastDice ?? { values: [1, 1] as [number, number], total: 2, isDouble: true };
    const rent = calculateRent(player.position, player.id, this.state, dice);

    if (rent <= 0) return;

    // Plafonner au solde du joueur : il ne peut payer que ce qu'il a
    const actuallyPaid = Math.min(rent, Math.max(0, player.balance));
    const ownerPlayer = this.state.players.find((p) => p.id === owner.ownerId);

    if (actuallyPaid > 0) {
      adjustBalance(player, -actuallyPaid);
      if (ownerPlayer) {
        adjustBalance(ownerPlayer, actuallyPaid);
        this.eventBus.emit('player:balance:changed', {
          playerId: ownerPlayer.id,
          delta: actuallyPaid,
          newBalance: ownerPlayer.balance,
        });
      }
      this.eventBus.emit('rent:paid', {
        fromId: player.id,
        toId: owner.ownerId,
        amount: actuallyPaid,
      });
      this.eventBus.emit('player:balance:changed', {
        playerId: player.id,
        delta: -actuallyPaid,
        newBalance: player.balance,
      });
    }

    logger.info(`${player.name} paye ${actuallyPaid}€ de loyer (dû: ${rent}€)`);

    if (actuallyPaid < rent) {
      // Faillite envers le propriétaire : transfert des actifs
      this.declareBankruptcy(player, owner.ownerId);
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
    if (player.balance < 0) {
      // Faillite envers la banque (pas de créancier identifié)
      this.declareBankruptcy(player, null);
    }
  }

  /**
   * Déclare un joueur en faillite et transfère ses actifs au créancier
   * (ou à la banque si creditorId === null).
   */
  private declareBankruptcy(player: Player, creditorId: PlayerId | null): void {
    if (player.isBankrupt) return;
    transferBankruptAssets(this.state, player.id, creditorId);
    declareBankrupt(player);
    this.eventBus.emit('player:bankrupt', { playerId: player.id });
    this.eventBus.emit('player:balance:changed', {
      playerId: player.id,
      delta: 0,
      newBalance: player.balance,
    });
    logger.info(
      `${player.name} est en faillite${creditorId ? ` (créancier: ${creditorId})` : ' (banque)'}`,
    );
  }

  private afterAction(): void {
    this.eventBus.emit('ui:action:required', {
      type: 'end-turn',
      context: { playerId: this.getCurrentPlayer().id },
    });
  }

  private finishTurn(): void {
    // La state machine accepte maintenant ROLLING/MOVING/ACTION/BUILDING → END_TURN,
    // donc pas besoin de try/catch.
    const phase = this.turnManager.getPhase();
    if (phase !== TurnPhase.END_TURN) {
      this.turnManager.transitionTo(TurnPhase.END_TURN);
    }
    this.handleEndTurn();
  }

  private sendPlayerToJail(player: Player): void {
    player.position = JAIL_SQUARE;
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
