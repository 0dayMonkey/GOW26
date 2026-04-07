/**
 * Main — Presentation Layer (Point d entree)
 *
 * Bootstrap complet : scene, plateau, pions, des, batiments,
 * connexion EventBus → visuel, et demarrage de la partie.
 */

import { SceneManager } from './scene-manager';
import { PawnController } from './pawns/pawn-controller';
import { DiceRenderer } from './dice/dice-renderer';
import { BuildingManager } from './buildings/building-manager';
import { SquareHighlight } from './board/square-highlight';
import { AssetLoader } from '@infrastructure/asset-loader';
import { EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';
import { GameController } from '@application/game-controller';
import { createHumanPlayer, createAIPlayer } from '@game-logic/player/player-factory';

const logger = Logger.create('Main');

// ─── Splash screen ──────────────────────────────────────────────────

function updateSplash(progress: number, status: string): void {
  const fill = document.getElementById('progressFill') as HTMLElement | null;
  const statusEl = document.getElementById('splashStatus') as HTMLElement | null;
  if (fill) fill.style.width = `${progress}%`;
  if (statusEl) statusEl.textContent = status;
}

function hideSplash(): void {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 600);
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  updateSplash(5, 'Demarrage du moteur...');

  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas #renderCanvas introuvable');

  // 1. Scene Manager
  const sceneManager = new SceneManager(canvas);
  updateSplash(10, 'Creation de la scene...');

  // 2. Charger les assets
  const assetLoader = new AssetLoader(sceneManager.getScene());
  await assetLoader.loadAll({
    onProgress: (progress, status) => {
      updateSplash(10 + progress * 0.3, status);
    },
  });

  // 3. Initialiser la scene (eclairage, camera, plateau)
  updateSplash(45, 'Construction du plateau 3D...');
  await sceneManager.initialize();

  const scene = sceneManager.getScene();
  const boardBuilder = sceneManager.getBoard()!;

  // 4. EventBus
  const eventBus = new EventBus();

  // 5. Des
  updateSplash(55, 'Creation des des...');
  const diceRenderer = new DiceRenderer(scene, eventBus);
  diceRenderer.setup();
  diceRenderer.connectEvents();

  // 6. Batiments
  updateSplash(65, 'Preparation des batiments...');
  const buildingManager = new BuildingManager(scene, eventBus, boardBuilder);
  buildingManager.setup();
  buildingManager.connectEvents();

  // 7. Highlight de case
  const squareHighlight = new SquareHighlight(scene);

  // 8. Creer les joueurs
  updateSplash(75, 'Preparation des joueurs...');
  const players = [
    createHumanPlayer('Vous', 0),
    createAIPlayer('Bot Alice', 1),
  ];

  // 9. Pions
  updateSplash(80, 'Placement des pions...');
  const pawnController = new PawnController(scene, eventBus, boardBuilder);
  pawnController.createPawns(players);
  pawnController.connectEvents();

  // 10. GameController
  updateSplash(90, 'Initialisation du jeu...');
  const gameController = new GameController(players, eventBus);

  // 11. Connecter le highlight de case aux tours
  eventBus.on('pawn:moved', (data) => {
    const pos = boardBuilder.getSquarePosition(data.to);
    squareHighlight.show(pos);
  });

  eventBus.on('turn:started', (data) => {
    const player = gameController.getState().players.find((p) => p.id === data.playerId);
    if (player) {
      const pos = boardBuilder.getSquarePosition(player.position);
      squareHighlight.show(pos);
    }
  });

  // 12. Connecter le bouton "Lancer les des" pour le joueur humain
  setupHumanControls(gameController, eventBus);

  // 13. Log des evenements en dev
  setupEventLogging(eventBus);

  // 14. References debug
  (window as Record<string, unknown>).__game = gameController;
  (window as Record<string, unknown>).__scene = sceneManager;
  (window as Record<string, unknown>).__bus = eventBus;
  (window as Record<string, unknown>).__pawns = pawnController;
  (window as Record<string, unknown>).__dice = diceRenderer;

  // 15. Demarrer le rendu
  updateSplash(100, 'Pret !');
  sceneManager.startRenderLoop();
  hideSplash();

  // 16. Demarrer la partie
  gameController.startGame();

  logger.info('Monopoly 3D demarre — Phase 5');
}

// ─── Controles humain (temporaire, sera remplace par UI Phase 6) ────

function setupHumanControls(controller: GameController, bus: EventBus): void {
  // Clavier pour les actions du joueur humain
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const player = controller.getCurrentPlayer();
    if (player.isAI) return; // L IA joue toute seule

    switch (e.key) {
      case ' ': // Espace = lancer les des
      case 'Enter':
        controller.handleRollDice();
        break;

      case 'b': // B = acheter
        controller.handleBuyProperty();
        break;

      case 'n': // N = decliner
        controller.handleDeclineProperty();
        break;

      case 'e': // E = fin de tour
        controller.handleEndTurn();
        break;

      case 'p': // P = payer amende prison
        controller.handlePayJailFine();
        break;

      case 'c': // C = carte sortie prison
        controller.handleUseJailCard();
        break;
    }
  });

  // Notification des controles
  bus.on('turn:started', (data) => {
    const player = controller.getState().players.find((p) => p.id === data.playerId);
    if (player && !player.isAI) {
      bus.emit('ui:notification', {
        message: 'Votre tour ! [Espace] pour lancer les des',
        level: 'info',
      });
    }
  });

  bus.on('ui:action:required', (data) => {
    const player = controller.getState().players.find((p) => p.id === data.context.playerId);
    if (!player || player.isAI) return;

    switch (data.type) {
      case 'buy-property':
        bus.emit('ui:notification', {
          message: `Acheter pour ${data.context.price}€ ? [B] Acheter / [N] Decliner`,
          level: 'info',
        });
        break;
      case 'end-turn':
        bus.emit('ui:notification', {
          message: '[E] Fin de tour',
          level: 'info',
        });
        break;
    }
  });
}

// ─── Debug : log evenements ─────────────────────────────────────────

function setupEventLogging(bus: EventBus): void {
  const events = [
    'game:started', 'game:ended',
    'turn:started', 'turn:ended',
    'dice:rolled', 'pawn:moved',
    'property:bought', 'rent:paid',
    'card:drawn', 'building:placed',
    'player:jailed', 'player:released',
    'player:bankrupt', 'player:balance:changed',
    'ui:notification',
  ] as const;

  for (const event of events) {
    bus.on(event, (data: unknown) => {
      logger.info(`[Event] ${event}`, data);
    });
  }
}

// ─── Lancement ──────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error('[FATAL] Echec initialisation:', err);
});
