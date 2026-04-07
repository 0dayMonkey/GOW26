/**
 * Main — Presentation Layer (Point d entree)
 *
 * Bootstrap complet Phase 6 : scene, plateau, pions, des, batiments,
 * HUD, action panel, notifications, affichage cartes.
 * Controles clavier conserves en parallele des boutons.
 */

import { SceneManager } from './scene-manager';
import { PawnController } from './pawns/pawn-controller';
import { DiceRenderer } from './dice/dice-renderer';
import { BuildingManager } from './buildings/building-manager';
import { SquareHighlight } from './board/square-highlight';
import { HudOverlay } from './ui/hud-overlay';
import { ActionPanel } from './ui/action-panel';
import { NotificationSystem } from './ui/notification';
import { CardDisplay } from './ui/card-display';
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
      updateSplash(10 + progress * 0.25, status);
    },
  });

  // 3. Initialiser la scene (eclairage, camera, plateau)
  updateSplash(40, 'Construction du plateau 3D...');
  await sceneManager.initialize();

  const scene = sceneManager.getScene();
  const boardBuilder = sceneManager.getBoard()!;

  // 4. EventBus
  const eventBus = new EventBus();

  // 5. Des
  updateSplash(50, 'Creation des des...');
  const diceRenderer = new DiceRenderer(scene, eventBus);
  diceRenderer.setup();
  diceRenderer.connectEvents();

  // 6. Batiments
  updateSplash(55, 'Preparation des batiments...');
  const buildingManager = new BuildingManager(scene, eventBus, boardBuilder);
  buildingManager.setup();
  buildingManager.connectEvents();

  // 7. Highlight de case
  const squareHighlight = new SquareHighlight(scene);

  // 8. Creer les joueurs
  updateSplash(60, 'Preparation des joueurs...');
  const players = [
    createHumanPlayer('Vous', 0),
    createAIPlayer('Bot Alice', 1),
  ];

  // 9. Pions
  updateSplash(65, 'Placement des pions...');
  const pawnController = new PawnController(scene, eventBus, boardBuilder);
  pawnController.createPawns(players);
  pawnController.connectEvents();

  // 10. GameController
  updateSplash(70, 'Initialisation du jeu...');
  const gameController = new GameController(players, eventBus);

  // 11. UI — HUD Overlay
  updateSplash(75, 'Creation de l interface...');
  const hud = new HudOverlay(eventBus, () => gameController.getState());
  hud.setup();
  hud.connectEvents();

  // 12. UI — Action Panel
  updateSplash(80, 'Panneau d actions...');
  const actionPanel = new ActionPanel(
    eventBus,
    () => gameController.getState(),
    {
      rollDice: () => gameController.handleRollDice(),
      buyProperty: () => gameController.handleBuyProperty(),
      declineProperty: () => gameController.handleDeclineProperty(),
      endTurn: () => gameController.handleEndTurn(),
      payJailFine: () => gameController.handlePayJailFine(),
      useJailCard: () => gameController.handleUseJailCard(),
      buildHouse: (sq: number) => gameController.handleBuildHouse(sq),
    },
  );
  actionPanel.setup();
  actionPanel.connectEvents();

  // 13. UI — Notifications
  updateSplash(85, 'Notifications...');
  const notifications = new NotificationSystem(eventBus);
  notifications.setup();
  notifications.connectEvents();

  // 14. UI — Card Display
  updateSplash(88, 'Affichage des cartes...');
  const cardDisplay = new CardDisplay(eventBus);
  cardDisplay.setup();
  cardDisplay.connectEvents();

  // 15. Connecter le highlight de case
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

  // 16. Controles clavier (en parallele des boutons UI)
  setupKeyboardControls(gameController);

  // 17. Log des evenements en dev
  setupEventLogging(eventBus);

  // 18. References debug
  (window as Record<string, unknown>).__game = gameController;
  (window as Record<string, unknown>).__scene = sceneManager;
  (window as Record<string, unknown>).__bus = eventBus;
  (window as Record<string, unknown>).__pawns = pawnController;
  (window as Record<string, unknown>).__dice = diceRenderer;

  // 19. Demarrer le rendu
  updateSplash(95, 'Lancement...');
  sceneManager.startRenderLoop();

  updateSplash(100, 'Pret !');
  hideSplash();

  // 20. Demarrer la partie
  gameController.startGame();

  logger.info('Monopoly 3D demarre — Phase 6');
}

// ─── Controles clavier ──────────────────────────────────────────────

function setupKeyboardControls(controller: GameController): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Ignorer si on est dans un input
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    const player = controller.getCurrentPlayer();
    if (player.isAI) return;

    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        controller.handleRollDice();
        break;
      case 'b':
      case 'B':
        controller.handleBuyProperty();
        break;
      case 'n':
      case 'N':
        controller.handleDeclineProperty();
        break;
      case 'e':
      case 'E':
        controller.handleEndTurn();
        break;
      case 'p':
      case 'P':
        controller.handlePayJailFine();
        break;
      case 'c':
      case 'C':
        controller.handleUseJailCard();
        break;
    }
  });
}

// ─── Debug : log evenements ─────────────────────────────────────────

function setupEventLogging(bus: EventBus): void {
  const events = [
    'game:started', 'game:ended',
    'turn:started', 'turn:ended',
    'dice:rolled', 'dice:animation:complete',
    'pawn:moved',
    'property:bought', 'rent:paid',
    'card:drawn', 'building:placed',
    'player:jailed', 'player:released',
    'player:bankrupt', 'player:balance:changed',
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
