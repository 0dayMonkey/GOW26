/**
 * PropertyCardOverlay — Presentation Layer (UI)
 *
 * Carte de propriete style Monopoly classique en overlay anime.
 * Apparait quand le joueur humain atterrit sur une case achetable.
 * Affiche bandeau couleur, nom, loyers detailles, cout construction.
 *
 * [CERTAIN] DOM pur — 0 draw calls
 */

import { type EventBus } from '@infrastructure/event-bus';
import { type GameState, SquareType, ColorGroup, type PropertySquare, type StationSquare, type UtilitySquare } from '@game-logic/types';
import { BOARD_SQUARES } from '@game-logic/board/board-definition';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('PropertyCardOverlay');

const GROUP_CSS: Record<string, { bg: string; text: string }> = {
  [ColorGroup.VIOLET]:     { bg: '#8B45A6', text: '#fff' },
  [ColorGroup.LIGHT_BLUE]: { bg: '#AAD8E6', text: '#1a1a1a' },
  [ColorGroup.PINK]:       { bg: '#D93274', text: '#fff' },
  [ColorGroup.ORANGE]:     { bg: '#ED930F', text: '#fff' },
  [ColorGroup.RED]:        { bg: '#DB3328', text: '#fff' },
  [ColorGroup.YELLOW]:     { bg: '#F1E634', text: '#1a1a1a' },
  [ColorGroup.GREEN]:      { bg: '#1E8C2F', text: '#fff' },
  [ColorGroup.DARK_BLUE]:  { bg: '#003D99', text: '#fff' },
};

export class PropertyCardOverlay {
  private readonly eventBus: EventBus;
  private readonly getState: () => GameState;
  private container: HTMLElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(eventBus: EventBus, getState: () => GameState) {
    this.eventBus = eventBus;
    this.getState = getState;
  }

  setup(): void {
    const style = document.createElement('style');
    style.textContent = `
      #prop-card-overlay {
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        z-index: 45; pointer-events: none;
        transition: opacity 0.4s ease, transform 0.4s ease;
      }
      #prop-card-overlay.hidden {
        opacity: 0; transform: translate(-50%, -45%) scale(0.85);
      }
      #prop-card-overlay.visible {
        opacity: 1; transform: translate(-50%, -50%) scale(1);
        pointer-events: auto;
      }
      .pco-inner {
        width: 280px; background: #FFFEF5; border-radius: 10px;
        overflow: hidden; font-family: Georgia, serif;
        box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 0 0 3px rgba(0,0,0,0.15);
      }
      .pco-banner { padding: 14px 16px 12px; text-align: center; }
      .pco-label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.85; margin-bottom: 4px; }
      .pco-name { font-size: 16px; font-weight: 700; line-height: 1.2; }
      .pco-body { padding: 12px 16px 16px; }
      .pco-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; color: #333; }
      .pco-row.main { font-weight: 700; font-size: 13px; padding-bottom: 5px; border-bottom: 1px solid #ddd; margin-bottom: 3px; }
      .pco-row.hotel { font-weight: 700; color: #B71C1C; }
      .pco-val { font-weight: 600; font-variant-numeric: tabular-nums; }
      .pco-div { height: 1px; background: #ddd; margin: 8px 0; }
      .pco-info { display: flex; justify-content: space-between; font-size: 11px; color: #555; padding: 2px 0; }
      .pco-price { text-align: center; font-weight: 700; font-size: 14px; color: #222; padding: 6px 0 4px; }
      .pco-note { text-align: center; font-size: 9px; color: #888; font-style: italic; line-height: 1.3; padding-top: 4px; }
    `;
    document.head.appendChild(style);

    const gameUi = document.getElementById('game-ui');
    if (!gameUi) return;
    this.container = document.createElement('div');
    this.container.id = 'prop-card-overlay';
    this.container.className = 'hidden';
    gameUi.appendChild(this.container);
    logger.info('Property card overlay cree');
  }

  connectEvents(): void {
    this.eventBus.on('ui:action:required', (data) => {
      if (data.type === 'buy-property' && data.context.squareIndex !== undefined) {
        const p = this.getState().players.find((pl) => pl.id === data.context.playerId);
        if (p && !p.isAI) this.show(data.context.squareIndex);
      }
      if (data.type === 'end-turn') this.hide();
    });
    this.eventBus.on('property:bought', () => this.hide());
    this.eventBus.on('turn:ended', () => this.hide());
  }

  show(idx: number): void {
    if (!this.container) return;
    const sq = BOARD_SQUARES[idx];
    if (!sq) return;

    let html = '';
    if (sq.type === SquareType.PROPERTY) html = this.propCard(sq as PropertySquare);
    else if (sq.type === SquareType.STATION) html = this.stationCard(sq as StationSquare);
    else if (sq.type === SquareType.UTILITY) html = this.utilityCard(sq as UtilitySquare);
    else return;

    this.container.innerHTML = html;
    this.container.className = 'visible';
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), 8000);
  }

  hide(): void {
    if (this.container) this.container.className = 'hidden';
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
  }

  private propCard(sq: PropertySquare): string {
    const c = GROUP_CSS[sq.color] ?? { bg: '#999', text: '#fff' };
    return `<div class="pco-inner">
      <div class="pco-banner" style="background:${c.bg};color:${c.text}">
        <div class="pco-label">TITRE DE PROPRIÉTÉ</div>
        <div class="pco-name">${sq.name}</div>
      </div>
      <div class="pco-body">
        <div class="pco-row main"><span>Loyer</span><span class="pco-val">${sq.rent[0]}€</span></div>
        <div class="pco-row"><span>Avec 1 Maison</span><span class="pco-val">${sq.rent[1]}€</span></div>
        <div class="pco-row"><span>Avec 2 Maisons</span><span class="pco-val">${sq.rent[2]}€</span></div>
        <div class="pco-row"><span>Avec 3 Maisons</span><span class="pco-val">${sq.rent[3]}€</span></div>
        <div class="pco-row"><span>Avec 4 Maisons</span><span class="pco-val">${sq.rent[4]}€</span></div>
        <div class="pco-row hotel"><span>Avec HÔTEL</span><span class="pco-val">${sq.rent[5]}€</span></div>
        <div class="pco-div"></div>
        <div class="pco-info"><span>Prix d'une maison</span><span>${sq.houseCost}€</span></div>
        <div class="pco-info"><span>Prix d'un hôtel</span><span>${sq.houseCost}€ + 4🏠</span></div>
        <div class="pco-div"></div>
        <div class="pco-price">Prix d'achat : ${sq.price}€</div>
        <div class="pco-note">Si vous possédez TOUTES les propriétés de ce groupe, le loyer nu est doublé.</div>
      </div>
    </div>`;
  }

  private stationCard(sq: StationSquare): string {
    return `<div class="pco-inner">
      <div class="pco-banner" style="background:#444;color:#fff">
        <div class="pco-label">🚂</div>
        <div class="pco-name">${sq.name}</div>
      </div>
      <div class="pco-body">
        <div class="pco-row"><span>1 Gare</span><span class="pco-val">25€</span></div>
        <div class="pco-row"><span>2 Gares</span><span class="pco-val">50€</span></div>
        <div class="pco-row"><span>3 Gares</span><span class="pco-val">100€</span></div>
        <div class="pco-row hotel"><span>4 Gares</span><span class="pco-val">200€</span></div>
        <div class="pco-div"></div>
        <div class="pco-price">Prix d'achat : ${sq.price}€</div>
      </div>
    </div>`;
  }

  private utilityCard(sq: UtilitySquare): string {
    const icon = sq.name.includes('lectricit') ? '⚡' : '💧';
    return `<div class="pco-inner">
      <div class="pco-banner" style="background:#8D6E63;color:#fff">
        <div class="pco-label">${icon}</div>
        <div class="pco-name">${sq.name}</div>
      </div>
      <div class="pco-body">
        <div class="pco-row"><span>1 Compagnie</span><span class="pco-val">4× le dé</span></div>
        <div class="pco-row hotel"><span>2 Compagnies</span><span class="pco-val">10× le dé</span></div>
        <div class="pco-div"></div>
        <div class="pco-price">Prix d'achat : ${sq.price}€</div>
      </div>
    </div>`;
  }
}
