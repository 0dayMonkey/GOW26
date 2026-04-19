/**
 * HudOverlay — Presentation Layer (UI)
 *
 * Affiche les informations des joueurs en overlay DOM.
 * Solde, position, nombre de proprietes, statut prison.
 * Met a jour automatiquement via EventBus.
 */

import { type EventBus } from '@infrastructure/event-bus';
import { type GameState, type Player } from '@game-logic/types';
import { BOARD_SQUARES } from '@game-logic/board/board-definition';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('HudOverlay');

const PLAYER_COLORS = ['#d32f2f', '#1565c0', '#2e7d32', '#f9a825'];

export class HudOverlay {
  private readonly eventBus: EventBus;
  private readonly getState: () => GameState;
  private container: HTMLElement | null = null;
  private playerCards: Map<string, HTMLElement> = new Map();
  private turnIndicator: HTMLElement | null = null;

  constructor(eventBus: EventBus, getState: () => GameState) {
    this.eventBus = eventBus;
    this.getState = getState;
  }

  /**
   * Creer le HUD et l injecter dans le DOM.
   */
  setup(): void {
    const gameUi = document.getElementById('game-ui');
    if (!gameUi) return;

    this.container = document.createElement('div');
    this.container.id = 'hud-overlay';
    this.container.innerHTML = `
      <style>
        #hud-overlay {
          position: absolute;
          top: 12px;
          left: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 20;
          pointer-events: none;
        }
        .hud-player-card {
          background: rgba(15, 15, 25, 0.85);
          border-left: 4px solid #fff;
          border-radius: 6px;
          padding: 10px 14px;
          min-width: 200px;
          color: #e0e0e0;
          font-family: 'Segoe UI', sans-serif;
          font-size: 13px;
          backdrop-filter: blur(8px);
          transition: all 0.3s ease;
        }
        .hud-player-card.active {
          background: rgba(25, 25, 45, 0.92);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.1);
        }
        .hud-player-card.bankrupt {
          opacity: 0.4;
          text-decoration: line-through;
        }
        .hud-player-name {
          font-weight: 700;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .hud-player-balance {
          font-size: 16px;
          font-weight: 600;
          color: #ffd54f;
        }
        .hud-player-info {
          color: #aaa;
          font-size: 11px;
          margin-top: 3px;
        }
        .hud-player-jail {
          color: #ff8a65;
          font-weight: 600;
        }
        #hud-turn-indicator {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(15, 15, 25, 0.85);
          border-radius: 8px;
          padding: 10px 16px;
          color: #e0e0e0;
          font-family: 'Segoe UI', sans-serif;
          font-size: 14px;
          backdrop-filter: blur(8px);
          z-index: 20;
          pointer-events: none;
        }
        #hud-turn-indicator .turn-player {
          font-weight: 700;
          font-size: 16px;
        }
        #hud-turn-indicator .turn-phase {
          color: #aaa;
          font-size: 11px;
          margin-top: 2px;
        }
      </style>
    `;
    gameUi.appendChild(this.container);

    // Indicateur de tour
    this.turnIndicator = document.createElement('div');
    this.turnIndicator.id = 'hud-turn-indicator';
    gameUi.appendChild(this.turnIndicator);

    // Creer les cartes joueurs
    this.createPlayerCards();

    logger.info('HUD cree');
  }

  /**
   * Connecter les evenements pour mise a jour automatique.
   */
  connectEvents(): void {
    this.eventBus.on('turn:started', () => {
      // Réinitialiser l'indicateur (effacer l'affichage des dés du tour précédent)
      this.update();
    });
    this.eventBus.on('turn:ended', () => this.update());
    this.eventBus.on('player:balance:changed', () => this.update());
    this.eventBus.on('property:bought', () => this.update());
    this.eventBus.on('player:jailed', () => this.update());
    this.eventBus.on('player:released', () => this.update());
    this.eventBus.on('player:bankrupt', () => this.update());
    this.eventBus.on('pawn:moved', () => this.update());
    this.eventBus.on('building:placed', () => this.update());
    this.eventBus.on('dice:rolled', (data) => {
      this.updateDice(data.values[0], data.values[1], data.isDouble);
    });
  }

  /**
   * Mise a jour complete du HUD.
   */
  update(): void {
    const state = this.getState();

    for (const player of state.players) {
      this.updatePlayerCard(player, state);
    }

    this.updateTurnIndicator(state);
  }

  // ─── Creation ──────────────────────────────────────────────────

  private createPlayerCards(): void {
    const state = this.getState();

    for (let i = 0; i < state.players.length; i++) {
      const player = state.players[i]!;
      const card = document.createElement('div');
      card.className = 'hud-player-card';
      card.style.borderLeftColor = PLAYER_COLORS[i] ?? '#fff';
      card.dataset.playerId = player.id;
      this.container!.appendChild(card);
      this.playerCards.set(player.id, card);
    }

    this.update();
  }

  private updatePlayerCard(player: Player, state: GameState): void {
    const card = this.playerCards.get(player.id);
    if (!card) return;

    const isActive = state.players[state.currentPlayerIndex]?.id === player.id;
    const squareName = BOARD_SQUARES[player.position]?.name ?? `Case ${player.position}`;
    const ownedCount = state.properties.filter((p) => p.ownerId === player.id).length;
    const houseCount = state.properties
      .filter((p) => p.ownerId === player.id && p.houses > 0 && p.houses < 5)
      .reduce((sum, p) => sum + p.houses, 0);
    const hotelCount = state.properties
      .filter((p) => p.ownerId === player.id && p.houses === 5).length;

    card.className = `hud-player-card${isActive ? ' active' : ''}${player.isBankrupt ? ' bankrupt' : ''}`;

    let html = `
      <div class="hud-player-name">${player.isAI ? '🤖' : '👤'} ${player.name}</div>
      <div class="hud-player-balance">${player.balance.toLocaleString('fr-FR')} €</div>
      <div class="hud-player-info">📍 ${squareName}</div>
    `;

    if (ownedCount > 0) {
      html += `<div class="hud-player-info">🏠 ${ownedCount} prop.`;
      if (houseCount > 0) html += ` · ${houseCount} maisons`;
      if (hotelCount > 0) html += ` · ${hotelCount} hotels`;
      html += `</div>`;
    }

    if (player.inJail) {
      html += `<div class="hud-player-jail">⛓ En prison (tour ${player.jailTurns}/3)</div>`;
    }

    if (player.getOutOfJailCards > 0) {
      html += `<div class="hud-player-info">🎫 ${player.getOutOfJailCards} carte(s) sortie prison</div>`;
    }

    if (player.isBankrupt) {
      html += `<div class="hud-player-jail">💀 Faillite</div>`;
    }

    card.innerHTML = html;
  }

  private updateTurnIndicator(state: GameState): void {
    if (!this.turnIndicator) return;
    const current = state.players[state.currentPlayerIndex];
    if (!current) return;

    this.turnIndicator.innerHTML = `
      <div class="turn-player">Tour de ${current.name}</div>
      <div class="turn-phase">Tour #${state.turnCount + 1}</div>
    `;
  }

  private updateDice(v1: number, v2: number, isDouble: boolean): void {
    if (!this.turnIndicator) return;
    const current = this.getState().players[this.getState().currentPlayerIndex];
    if (!current) return;

    this.turnIndicator.innerHTML = `
      <div class="turn-player">Tour de ${current.name}</div>
      <div class="turn-phase">🎲 ${v1} + ${v2} = ${v1 + v2}${isDouble ? ' DOUBLE!' : ''}</div>
    `;
  }
}
