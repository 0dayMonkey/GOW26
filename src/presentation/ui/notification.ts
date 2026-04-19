/**
 * Notification — Presentation Layer (UI)
 *
 * Systeme de toasts pour afficher les evenements de jeu.
 * Apparition/disparition animee. Maximum 4 toasts visibles.
 */

import { type EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('Notification');

const MAX_TOASTS = 4;
const TOAST_DURATION = 3500;
const TOAST_FADE = 400;

export class NotificationSystem {
  private readonly eventBus: EventBus;
  private container: HTMLElement | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Creer le conteneur de toasts.
   */
  setup(): void {
    const gameUi = document.getElementById('game-ui');
    if (!gameUi) return;

    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.innerHTML = `
      <style>
        #toast-container {
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          z-index: 30;
          pointer-events: none;
        }
        .toast {
          background: rgba(20, 20, 35, 0.92);
          border-radius: 8px;
          padding: 10px 20px;
          color: #e0e0e0;
          font-family: 'Segoe UI', sans-serif;
          font-size: 13px;
          backdrop-filter: blur(10px);
          border-left: 3px solid #666;
          max-width: 400px;
          text-align: center;
          animation: toast-in 0.3s ease-out;
          transition: opacity 0.4s ease;
        }
        .toast.info { border-left-color: #42a5f5; }
        .toast.warn { border-left-color: #ffa726; }
        .toast.success { border-left-color: #66bb6a; }
        .toast.fade-out {
          opacity: 0;
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    `;
    gameUi.appendChild(this.container);

    logger.info('Systeme de notifications cree');
  }

  /**
   * Connecter les evenements.
   */
  connectEvents(): void {
    this.eventBus.on('ui:notification', (data) => {
      this.showToast(data.message, data.level);
    });

    // Notifications automatiques pour les evenements cles
    this.eventBus.on('property:bought', (data) => {
      const state = (window as unknown as Record<string, unknown>).__game as { getState: () => { players: Array<{ id: string; name: string }> } } | undefined;
      const player = state?.getState().players.find((p) => p.id === data.playerId);
      this.showToast(`${player?.name ?? 'Joueur'} achete pour ${data.price} €`, 'success');
    });

    this.eventBus.on('rent:paid', (data) => {
      this.showToast(`Loyer paye : ${data.amount} €`, 'warn');
    });

    this.eventBus.on('card:drawn', (data) => {
      const typeLabel = data.type === 'chance' ? '🃏 Chance' : '📦 Caisse de Communaute';
      this.showToast(`${typeLabel} tiree`, 'info');
    });

    this.eventBus.on('player:jailed', (data) => {
      const state = (window as unknown as Record<string, unknown>).__game as { getState: () => { players: Array<{ id: string; name: string }> } } | undefined;
      const player = state?.getState().players.find((p) => p.id === data.playerId);
      this.showToast(`⛓ ${player?.name ?? 'Joueur'} va en prison !`, 'warn');
    });

    this.eventBus.on('player:released', (data) => {
      const state = (window as unknown as Record<string, unknown>).__game as { getState: () => { players: Array<{ id: string; name: string }> } } | undefined;
      const player = state?.getState().players.find((p) => p.id === data.playerId);
      this.showToast(`🔓 ${player?.name ?? 'Joueur'} sort de prison`, 'success');
    });

    this.eventBus.on('player:bankrupt', (data) => {
      const state = (window as unknown as Record<string, unknown>).__game as { getState: () => { players: Array<{ id: string; name: string }> } } | undefined;
      const player = state?.getState().players.find((p) => p.id === data.playerId);
      this.showToast(`💀 ${player?.name ?? 'Joueur'} est en faillite !`, 'warn');
    });

    this.eventBus.on('game:ended', (data) => {
      const state = (window as unknown as Record<string, unknown>).__game as { getState: () => { players: Array<{ id: string; name: string }> } } | undefined;
      const winner = state?.getState().players.find((p) => p.id === data.winnerId);
      this.showToast(`🏆 ${winner?.name ?? 'Joueur'} remporte la partie !`, 'success');
    });
  }

  /**
   * Afficher un toast.
   */
  showToast(message: string, level: 'info' | 'warn' | 'success' = 'info'): void {
    if (!this.container) return;

    // Limiter le nombre de toasts
    while (this.container.children.length > MAX_TOASTS) {
      const oldest = this.container.querySelector('.toast');
      if (oldest) oldest.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${level}`;
    toast.textContent = message;
    this.container.appendChild(toast);

    // Disparition automatique
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, TOAST_FADE);
    }, TOAST_DURATION);
  }
}
