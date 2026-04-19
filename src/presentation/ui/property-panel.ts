/**
 * PropertyPanel — Presentation Layer (UI)
 *
 * Affiche les proprietes possedees par chaque joueur :
 * - Joueur humain : panneau de cartes consultable (toggle touche T)
 *   avec couleur, nom, prix, niveau de construction
 * - IA : liste compacte affichee en permanence a cote du HUD
 * - Mise a jour temps reel via EventBus
 *
 * [CERTAIN] DOM pur (pas de BJS GUI) — 0 draw call supplementaire
 * [TRADE-OFF] DOM vs BJS AdvancedDynamicTexture :
 *   - DOM = meilleur rendu texte, CSS animations, zero impact GPU
 *   - BJS GUI = integration 3D possible mais draw calls supplementaires
 *   - Decision : DOM pour les performances et la flexibilite
 */

import { type EventBus } from '@infrastructure/event-bus';
import { type GameState, type OwnedProperty, SquareType, ColorGroup } from '@game-logic/types';
import { BOARD_SQUARES } from '@game-logic/board/board-definition';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('PropertyPanel');

// ─── Couleurs CSS des groupes ────────────────────────────────────────

const GROUP_CSS: Record<string, string> = {
  [ColorGroup.VIOLET]: '#8B45A6',
  [ColorGroup.LIGHT_BLUE]: '#AAD8E6',
  [ColorGroup.PINK]: '#D93274',
  [ColorGroup.ORANGE]: '#ED930F',
  [ColorGroup.RED]: '#DB3328',
  [ColorGroup.YELLOW]: '#F1E634',
  [ColorGroup.GREEN]: '#1E8C2F',
  [ColorGroup.DARK_BLUE]: '#003D99',
};

// ═══════════════════════════════════════════════════════════════════════

export class PropertyPanel {
  private readonly eventBus: EventBus;
  private readonly getState: () => GameState;

  // DOM
  private humanPanel: HTMLElement | null = null;
  private humanCardsContainer: HTMLElement | null = null;
  private aiPanels: Map<string, HTMLElement> = new Map();
  private isOpen = false;

  constructor(eventBus: EventBus, getState: () => GameState) {
    this.eventBus = eventBus;
    this.getState = getState;
  }

  /**
   * Creer le panneau et l injecter dans le DOM.
   */
  setup(): void {
    this.injectStyles();
    this.createHumanPanel();
    this.createAIPanels();
    this.setupKeyboardToggle();

    logger.info('Property panel cree');
  }

  /**
   * Connecter les evenements pour mise a jour temps reel.
   */
  connectEvents(): void {
    this.eventBus.on('property:bought', () => this.update());
    this.eventBus.on('building:placed', () => this.update());
    this.eventBus.on('player:bankrupt', () => this.update());
    this.eventBus.on('turn:started', () => this.update());

    // Mise a jour initiale
    this.update();
  }

  /**
   * Mise a jour complete de tous les panneaux.
   */
  update(): void {
    const state = this.getState();
    this.updateHumanPanel(state);
    this.updateAIPanels(state);
  }

  /**
   * Toggle ouverture/fermeture du panneau humain.
   */
  toggle(): void {
    this.isOpen = !this.isOpen;
    if (this.humanPanel) {
      this.humanPanel.classList.toggle('open', this.isOpen);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CREATION DOM
  // ═══════════════════════════════════════════════════════════════════

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* ─── Panneau humain (cartes consultables) ─── */
      #property-panel-human {
        position: absolute;
        right: 12px;
        bottom: 80px;
        width: 320px;
        max-height: 0;
        overflow: hidden;
        background: rgba(15, 15, 25, 0.92);
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(12px);
        transition: max-height 0.4s ease, padding 0.3s ease, opacity 0.3s ease;
        opacity: 0;
        z-index: 35;
        pointer-events: auto;
        padding: 0 14px;
      }
      #property-panel-human.open {
        max-height: 500px;
        opacity: 1;
        padding: 14px;
      }
      #property-panel-human .panel-title {
        color: #ffd54f;
        font-family: 'Segoe UI', sans-serif;
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      #property-panel-human .panel-hint {
        color: #777;
        font-size: 11px;
        text-align: center;
        margin-top: 8px;
      }
      .property-cards {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 400px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #555 transparent;
      }
      .prop-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: rgba(30, 30, 50, 0.85);
        border-radius: 6px;
        border-left: 5px solid #666;
        transition: background 0.2s ease;
      }
      .prop-card:hover {
        background: rgba(40, 40, 65, 0.95);
      }
      .prop-card .color-badge {
        width: 12px;
        height: 28px;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .prop-card .card-info {
        flex: 1;
        min-width: 0;
      }
      .prop-card .card-name {
        color: #e0e0e0;
        font-family: 'Segoe UI', sans-serif;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .prop-card .card-details {
        color: #999;
        font-size: 10px;
        margin-top: 2px;
      }
      .prop-card .card-buildings {
        color: #66bb6a;
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
      }
      .prop-card-empty {
        color: #666;
        font-size: 12px;
        text-align: center;
        padding: 20px;
        font-style: italic;
      }

      /* ─── Toggle button ─── */
      #property-toggle-btn {
        position: absolute;
        right: 12px;
        bottom: 74px;
        background: rgba(25, 25, 45, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 8px 14px;
        color: #ccc;
        font-family: 'Segoe UI', sans-serif;
        font-size: 12px;
        cursor: pointer;
        z-index: 36;
        pointer-events: auto;
        transition: all 0.2s ease;
        backdrop-filter: blur(8px);
      }
      #property-toggle-btn:hover {
        background: rgba(40, 40, 65, 0.95);
        border-color: rgba(255, 255, 255, 0.3);
      }
      #property-toggle-btn.open {
        bottom: auto;
        /* Repositionne au-dessus du panneau ouvert */
      }

      /* ─── Panneaux IA (compacts) ─── */
      .ai-property-list {
        position: absolute;
        right: 12px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        z-index: 20;
        pointer-events: none;
        max-width: 200px;
      }
      .ai-prop-mini {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px;
        background: rgba(15, 15, 25, 0.75);
        border-radius: 4px;
        backdrop-filter: blur(4px);
      }
      .ai-prop-mini .mini-color {
        width: 8px;
        height: 14px;
        border-radius: 2px;
        flex-shrink: 0;
      }
      .ai-prop-mini .mini-name {
        color: #bbb;
        font-family: 'Segoe UI', sans-serif;
        font-size: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ai-prop-mini .mini-houses {
        color: #66bb6a;
        font-size: 9px;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  private createHumanPanel(): void {
    const gameUi = document.getElementById('game-ui');
    if (!gameUi) return;

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'property-toggle-btn';
    toggleBtn.textContent = '🏠 Mes propriétés (T)';
    toggleBtn.addEventListener('click', () => this.toggle());
    gameUi.appendChild(toggleBtn);

    // Panel
    this.humanPanel = document.createElement('div');
    this.humanPanel.id = 'property-panel-human';
    this.humanPanel.innerHTML = `
      <div class="panel-title">🏠 Mes propriétés</div>
      <div class="property-cards" id="human-property-cards"></div>
      <div class="panel-hint">Appuyez sur T pour fermer</div>
    `;
    gameUi.appendChild(this.humanPanel);

    this.humanCardsContainer = this.humanPanel.querySelector('#human-property-cards');
  }

  private createAIPanels(): void {
    const gameUi = document.getElementById('game-ui');
    if (!gameUi) return;

    const state = this.getState();
    let topOffset = 220; // Sous le HUD existant

    for (const player of state.players) {
      if (!player.isAI) continue;

      const panel = document.createElement('div');
      panel.className = 'ai-property-list';
      panel.style.top = `${topOffset}px`;
      panel.dataset.playerId = player.id;
      gameUi.appendChild(panel);

      this.aiPanels.set(player.id, panel);
      topOffset += 120;
    }
  }

  private setupKeyboardToggle(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 't' || e.key === 'T') {
        this.toggle();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  MISE A JOUR
  // ═══════════════════════════════════════════════════════════════════

  private updateHumanPanel(state: GameState): void {
    if (!this.humanCardsContainer) return;

    const human = state.players.find((p) => !p.isAI);
    if (!human) return;

    const ownedProps = state.properties.filter((p) => p.ownerId === human.id);

    if (ownedProps.length === 0) {
      this.humanCardsContainer.innerHTML = `<div class="prop-card-empty">Aucune propriété</div>`;
      return;
    }

    // Trier par groupe de couleur
    const sorted = [...ownedProps].sort((a, b) => a.squareIndex - b.squareIndex);

    this.humanCardsContainer.innerHTML = sorted.map((prop) => {
      const square = BOARD_SQUARES[prop.squareIndex]!;
      const color = this.getSquareColor(square);
      const buildingText = this.getBuildingText(prop);

      return `
        <div class="prop-card" style="border-left-color: ${color}">
          <div class="color-badge" style="background: ${color}"></div>
          <div class="card-info">
            <div class="card-name">${square.name}</div>
            <div class="card-details">${this.getSquareDetails(square)}</div>
          </div>
          ${buildingText ? `<div class="card-buildings">${buildingText}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  private updateAIPanels(state: GameState): void {
    for (const player of state.players) {
      if (!player.isAI) continue;

      const panel = this.aiPanels.get(player.id);
      if (!panel) continue;

      const ownedProps = state.properties.filter((p) => p.ownerId === player.id);

      if (ownedProps.length === 0) {
        panel.innerHTML = '';
        continue;
      }

      const sorted = [...ownedProps].sort((a, b) => a.squareIndex - b.squareIndex);

      panel.innerHTML = sorted.map((prop) => {
        const square = BOARD_SQUARES[prop.squareIndex]!;
        const color = this.getSquareColor(square);
        const houses = prop.houses > 0
          ? (prop.houses === 5 ? '🏨' : '🏠'.repeat(prop.houses))
          : '';

        return `
          <div class="ai-prop-mini">
            <div class="mini-color" style="background: ${color}"></div>
            <span class="mini-name">${this.getShortName(square.name)}</span>
            ${houses ? `<span class="mini-houses">${houses}</span>` : ''}
          </div>
        `;
      }).join('');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private getSquareColor(square: { type: string; color?: string }): string {
    if ('color' in square && square.color) {
      return GROUP_CSS[square.color as string] ?? '#666';
    }
    // Gares et compagnies
    if (square.type === SquareType.STATION) return '#444';
    if (square.type === SquareType.UTILITY) return '#8D6E63';
    return '#666';
  }

  private getSquareDetails(square: { type: string; price?: number }): string {
    if ('price' in square && square.price) {
      return `${square.price}€`;
    }
    return '';
  }

  private getBuildingText(prop: OwnedProperty): string {
    if (prop.houses === 0) return '';
    if (prop.houses === 5) return '🏨';
    return '🏠'.repeat(prop.houses);
  }

  private getShortName(name: string): string {
    // Raccourcir les noms longs pour l affichage IA
    if (name.length <= 18) return name;
    const parts = name.split(' ');
    if (parts.length <= 2) return name.substring(0, 16) + '…';
    // Garder le premier et dernier mot
    return `${parts[0]} … ${parts[parts.length - 1]}`;
  }
}
