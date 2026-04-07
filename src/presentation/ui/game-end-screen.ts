/**
 * GameEndScreen — Presentation Layer (UI)
 *
 * Ecran de victoire/defaite affiche en overlay DOM.
 * Apparition animee avec stats de fin de partie.
 */

import { type EventBus } from '@infrastructure/event-bus';
import { type GameState } from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('GameEndScreen');

export class GameEndScreen {
  private readonly eventBus: EventBus;
  private readonly getState: () => GameState;
  private overlay: HTMLElement | null = null;

  constructor(eventBus: EventBus, getState: () => GameState) {
    this.eventBus = eventBus;
    this.getState = getState;
  }

  /**
   * Creer l overlay (cache par defaut).
   */
  setup(): void {
    const gameUi = document.getElementById('game-ui');
    if (!gameUi) return;

    this.overlay = document.createElement('div');
    this.overlay.id = 'game-end-screen';
    this.overlay.innerHTML = `
      <style>
        #game-end-screen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0);
          display: none;
          justify-content: center;
          align-items: center;
          z-index: 100;
          pointer-events: auto;
          transition: background 0.8s ease;
        }
        #game-end-screen.visible {
          display: flex;
          background: rgba(0, 0, 0, 0.7);
        }
        .end-card {
          background: linear-gradient(145deg, #1a1a2e, #16213e);
          border-radius: 16px;
          padding: 40px 50px;
          text-align: center;
          color: #e0e0e0;
          font-family: 'Segoe UI', sans-serif;
          box-shadow: 0 16px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
          max-width: 450px;
          width: 90%;
          animation: end-card-in 0.6s ease-out;
        }
        .end-trophy {
          font-size: 64px;
          margin-bottom: 12px;
        }
        .end-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #ffd54f;
        }
        .end-subtitle {
          font-size: 14px;
          color: #aaa;
          margin-bottom: 24px;
        }
        .end-stats {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 28px;
        }
        .end-stat-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          font-size: 14px;
        }
        .end-stat-label { color: #aaa; }
        .end-stat-value { color: #e0e0e0; font-weight: 600; }
        .end-stat-value.highlight { color: #ffd54f; }
        .end-btn {
          background: rgba(33, 150, 243, 0.85);
          border: none;
          border-radius: 10px;
          padding: 14px 36px;
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Segoe UI', sans-serif;
        }
        .end-btn:hover {
          background: rgba(33, 150, 243, 1);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(33, 150, 243, 0.4);
        }
        @keyframes end-card-in {
          from { opacity: 0; transform: scale(0.8) translateY(30px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      </style>
      <div class="end-card" id="end-card"></div>
    `;
    gameUi.appendChild(this.overlay);

    logger.info('Ecran de fin cree');
  }

  /**
   * Connecter les evenements.
   */
  connectEvents(): void {
    this.eventBus.on('game:ended', (data) => {
      // Petit delai pour laisser les derniers events se propager
      setTimeout(() => this.show(data.winnerId), 1500);
    });
  }

  /**
   * Afficher l ecran de fin.
   */
  private show(winnerId: string): void {
    if (!this.overlay) return;

    const state = this.getState();
    const winner = state.players.find((p) => p.id === winnerId);
    if (!winner) return;

    const isHumanWinner = !winner.isAI;
    const card = this.overlay.querySelector('#end-card') as HTMLElement;

    // Stats
    const totalProperties = state.properties.filter((p) => p.ownerId === winnerId).length;
    const totalHouses = state.properties
      .filter((p) => p.ownerId === winnerId && p.houses > 0 && p.houses < 5)
      .reduce((sum, p) => sum + p.houses, 0);
    const totalHotels = state.properties
      .filter((p) => p.ownerId === winnerId && p.houses === 5).length;

    card.innerHTML = `
      <div class="end-trophy">${isHumanWinner ? '🏆' : '🤖'}</div>
      <div class="end-title">${isHumanWinner ? 'Victoire !' : 'Defaite...'}</div>
      <div class="end-subtitle">${winner.name} remporte la partie en ${state.turnCount} tours</div>
      <div class="end-stats">
        <div class="end-stat-row">
          <span class="end-stat-label">Solde final</span>
          <span class="end-stat-value highlight">${winner.balance.toLocaleString('fr-FR')} €</span>
        </div>
        <div class="end-stat-row">
          <span class="end-stat-label">Proprietes</span>
          <span class="end-stat-value">${totalProperties}</span>
        </div>
        <div class="end-stat-row">
          <span class="end-stat-label">Maisons</span>
          <span class="end-stat-value">${totalHouses}</span>
        </div>
        <div class="end-stat-row">
          <span class="end-stat-label">Hotels</span>
          <span class="end-stat-value">${totalHotels}</span>
        </div>
        <div class="end-stat-row">
          <span class="end-stat-label">Tours joues</span>
          <span class="end-stat-value">${state.turnCount}</span>
        </div>
      </div>
      <button class="end-btn" id="end-restart-btn">🔄 Nouvelle partie</button>
    `;

    this.overlay.classList.add('visible');

    // Bouton restart
    const restartBtn = card.querySelector('#end-restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        window.location.reload();
      });
    }

    logger.info('Ecran de fin affiche', { winner: winner.name, isHumanWinner });
  }
}
