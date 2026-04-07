/**
 * CardDisplay — Presentation Layer (UI)
 *
 * Affiche la carte tiree (Chance ou Caisse de Communaute) en overlay
 * avec animation d apparition et disparition automatique.
 */

import { type EventBus } from '@infrastructure/event-bus';
import { CHANCE_CARDS, COMMUNITY_CARDS } from '@game-logic/cards/card-definitions';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('CardDisplay');

const DISPLAY_DURATION = 3000;

export class CardDisplay {
  private readonly eventBus: EventBus;
  private overlay: HTMLElement | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Creer l overlay.
   */
  setup(): void {
    const gameUi = document.getElementById('game-ui');
    if (!gameUi) return;

    this.overlay = document.createElement('div');
    this.overlay.id = 'card-display';
    this.overlay.innerHTML = `
      <style>
        #card-display {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 40;
          pointer-events: none;
          display: none;
        }
        #card-display.visible {
          display: block;
          animation: card-appear 0.4s ease-out;
        }
        #card-display.fade-out {
          animation: card-disappear 0.4s ease-in forwards;
        }
        .card-frame {
          background: #fffef5;
          border-radius: 12px;
          padding: 24px 32px;
          min-width: 280px;
          max-width: 360px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.1);
          text-align: center;
          font-family: 'Segoe UI', serif;
        }
        .card-frame.chance {
          border-top: 6px solid #e65100;
        }
        .card-frame.community {
          border-top: 6px solid #1565c0;
        }
        .card-type {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 12px;
        }
        .card-frame.chance .card-type { color: #e65100; }
        .card-frame.community .card-type { color: #1565c0; }
        .card-icon {
          font-size: 36px;
          margin-bottom: 8px;
        }
        .card-description {
          color: #333;
          font-size: 16px;
          line-height: 1.5;
          font-weight: 500;
        }
        @keyframes card-appear {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.7) rotateY(90deg); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1) rotateY(0deg); }
        }
        @keyframes card-disappear {
          from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          to { opacity: 0; transform: translate(-50%, -50%) scale(0.8) translateY(-20px); }
        }
      </style>
      <div class="card-frame" id="card-frame">
        <div class="card-type" id="card-type-label"></div>
        <div class="card-icon" id="card-icon"></div>
        <div class="card-description" id="card-description"></div>
      </div>
    `;
    gameUi.appendChild(this.overlay);

    logger.info('Card display cree');
  }

  /**
   * Connecter les evenements.
   */
  connectEvents(): void {
    this.eventBus.on('card:drawn', (data) => {
      this.showCard(data.type, data.cardId);
    });
  }

  /**
   * Afficher une carte.
   */
  showCard(type: 'chance' | 'community', cardId: number): void {
    if (!this.overlay) return;

    const cards = type === 'chance' ? CHANCE_CARDS : COMMUNITY_CARDS;
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const frame = this.overlay.querySelector('#card-frame') as HTMLElement;
    const typeLabel = this.overlay.querySelector('#card-type-label') as HTMLElement;
    const icon = this.overlay.querySelector('#card-icon') as HTMLElement;
    const desc = this.overlay.querySelector('#card-description') as HTMLElement;

    frame.className = `card-frame ${type}`;
    typeLabel.textContent = type === 'chance' ? 'Chance' : 'Caisse de Communaute';
    icon.textContent = type === 'chance' ? '🃏' : '📦';
    desc.textContent = card.description;

    // Afficher
    this.overlay.classList.remove('fade-out');
    this.overlay.classList.add('visible');

    // Masquer apres un delai
    setTimeout(() => {
      if (this.overlay) {
        this.overlay.classList.add('fade-out');
        setTimeout(() => {
          if (this.overlay) {
            this.overlay.classList.remove('visible', 'fade-out');
          }
        }, 400);
      }
    }, DISPLAY_DURATION);
  }
}
