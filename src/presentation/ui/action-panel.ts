/**
 * ActionPanel — Presentation Layer (UI)
 *
 * Panneau d actions en bas de l ecran.
 * Affiche les boutons contextuels selon la phase du jeu.
 * Remplace les controles clavier de la Phase 5.
 */

import { type EventBus } from '@infrastructure/event-bus';
import { type GameState, TurnPhase } from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('ActionPanel');

type ActionCallback = {
  rollDice: () => void;
  buyProperty: () => void;
  declineProperty: () => void;
  endTurn: () => void;
  payJailFine: () => void;
  useJailCard: () => void;
  buildHouse: (squareIndex: number) => void;
};

export class ActionPanel {
  private readonly eventBus: EventBus;
  private readonly getState: () => GameState;
  private readonly actions: ActionCallback;
  private container: HTMLElement | null = null;
  private buttonsDiv: HTMLElement | null = null;

  constructor(eventBus: EventBus, getState: () => GameState, actions: ActionCallback) {
    this.eventBus = eventBus;
    this.getState = getState;
    this.actions = actions;
  }

  /**
   * Creer le panneau et l injecter dans le DOM.
   */
  setup(): void {
    const gameUi = document.getElementById('game-ui');
    if (!gameUi) return;

    this.container = document.createElement('div');
    this.container.id = 'action-panel';
    this.container.innerHTML = `
      <style>
        #action-panel {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          z-index: 25;
          pointer-events: auto;
        }
        #action-panel .action-message {
          background: rgba(15, 15, 25, 0.88);
          border-radius: 8px;
          padding: 8px 18px;
          color: #ccc;
          font-family: 'Segoe UI', sans-serif;
          font-size: 13px;
          backdrop-filter: blur(8px);
          text-align: center;
          max-width: 400px;
        }
        #action-panel .action-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }
        #action-panel .action-btn {
          background: rgba(30, 30, 55, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 10px 20px;
          color: #e0e0e0;
          font-family: 'Segoe UI', sans-serif;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(8px);
          pointer-events: auto;
        }
        #action-panel .action-btn:hover {
          background: rgba(50, 50, 85, 0.95);
          border-color: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        #action-panel .action-btn:active {
          transform: translateY(0);
        }
        #action-panel .action-btn.primary {
          background: rgba(33, 150, 243, 0.85);
          border-color: rgba(33, 150, 243, 0.5);
        }
        #action-panel .action-btn.primary:hover {
          background: rgba(33, 150, 243, 0.95);
        }
        #action-panel .action-btn.success {
          background: rgba(46, 125, 50, 0.85);
          border-color: rgba(46, 125, 50, 0.5);
        }
        #action-panel .action-btn.success:hover {
          background: rgba(46, 125, 50, 0.95);
        }
        #action-panel .action-btn.danger {
          background: rgba(198, 40, 40, 0.85);
          border-color: rgba(198, 40, 40, 0.5);
        }
        #action-panel .action-btn.danger:hover {
          background: rgba(198, 40, 40, 0.95);
        }
        #action-panel.hidden {
          display: none;
        }
      </style>
      <div class="action-message" id="action-message"></div>
      <div class="action-buttons" id="action-buttons"></div>
    `;
    gameUi.appendChild(this.container);

    this.buttonsDiv = this.container.querySelector('#action-buttons');
    this.hide();

    logger.info('Action panel cree');
  }

  /**
   * Connecter les evenements.
   */
  connectEvents(): void {
    this.eventBus.on('turn:started', (data) => {
      const state = this.getState();
      const player = state.players.find((p) => p.id === data.playerId);
      if (!player || player.isAI) {
        this.showAIWaiting(player?.name ?? 'IA');
        return;
      }

      if (player.inJail) {
        this.showJailActions(player);
      } else {
        this.showRollAction();
      }
    });

    this.eventBus.on('ui:action:required', (data) => {
      const state = this.getState();
      const player = state.players.find((p) => p.id === data.context.playerId);
      if (!player || player.isAI) return;

      switch (data.type) {
        case 'buy-property':
          this.showBuyAction(data.context.price ?? 0);
          break;
        case 'end-turn':
          this.showEndTurnAction();
          break;
      }
    });

    this.eventBus.on('dice:rolled', () => {
      this.showMessage('🎲 Des lances...');
    });

    this.eventBus.on('game:ended', (data) => {
      const state = this.getState();
      const winner = state.players.find((p) => p.id === data.winnerId);
      this.showMessage(`🏆 ${winner?.name ?? 'Joueur'} remporte la partie !`);
      this.clearButtons();
    });
  }

  // ─── Affichage des actions ─────────────────────────────────────

  private showRollAction(): void {
    this.show();
    this.setMessage('Votre tour !');
    this.setButtons([
      { label: '🎲 Lancer les des', className: 'primary', onClick: () => this.actions.rollDice() },
    ]);
  }

  private showJailActions(player: { balance: number; getOutOfJailCards: number }): void {
    this.show();
    this.setMessage('Vous etes en prison !');
    const buttons: Array<{ label: string; className: string; onClick: () => void }> = [
      { label: '🎲 Tenter un double', className: 'primary', onClick: () => this.actions.rollDice() },
    ];

    if (player.balance >= 50) {
      buttons.push({
        label: '💰 Payer 50€', className: 'danger', onClick: () => {
          this.actions.payJailFine();
          this.showRollAction();
        },
      });
    }

    if (player.getOutOfJailCards > 0) {
      buttons.push({
        label: '🎫 Utiliser carte', className: 'success', onClick: () => {
          this.actions.useJailCard();
          this.showRollAction();
        },
      });
    }

    this.setButtons(buttons);
  }

  private showBuyAction(price: number): void {
    this.show();
    this.setMessage(`Propriete disponible pour ${price.toLocaleString('fr-FR')} €`);
    this.setButtons([
      { label: `✅ Acheter (${price} €)`, className: 'success', onClick: () => this.actions.buyProperty() },
      { label: '❌ Decliner', className: 'danger', onClick: () => this.actions.declineProperty() },
    ]);
  }

  private showEndTurnAction(): void {
    this.show();
    this.setMessage('');
    this.setButtons([
      { label: '⏭ Fin de tour', className: 'primary', onClick: () => this.actions.endTurn() },
    ]);
  }

  private showAIWaiting(name: string): void {
    this.show();
    this.setMessage(`🤖 ${name} reflechit...`);
    this.clearButtons();
  }

  // ─── Utilitaires DOM ───────────────────────────────────────────

  private show(): void {
    if (this.container) this.container.classList.remove('hidden');
  }

  private hide(): void {
    if (this.container) this.container.classList.add('hidden');
  }

  private setMessage(msg: string): void {
    const el = this.container?.querySelector('#action-message') as HTMLElement | null;
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }
  }

  private showMessage(msg: string): void {
    this.show();
    this.setMessage(msg);
    this.clearButtons();
  }

  private setButtons(buttons: Array<{ label: string; className: string; onClick: () => void }>): void {
    if (!this.buttonsDiv) return;
    this.buttonsDiv.innerHTML = '';

    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = `action-btn ${btn.className}`;
      el.textContent = btn.label;
      el.addEventListener('click', btn.onClick);
      this.buttonsDiv.appendChild(el);
    }
  }

  private clearButtons(): void {
    if (this.buttonsDiv) this.buttonsDiv.innerHTML = '';
  }
}
