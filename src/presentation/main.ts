/**
 * Main — Presentation Layer (Point d entree)
 *
 * Bootstrap complet avec HoverCard3D pour les cartes 3D interactives au survol.
 * Remplace CardDisplay et PropertyCardOverlay par un systeme unifie.
 */

import { SceneManager } from './scene-manager';
import { PawnController } from './pawns/pawn-controller';
import { DiceRenderer } from './dice/dice-renderer';
import { BuildingManager } from './buildings/building-manager';
import { SquareHighlight } from './board/square-highlight';
import { HudOverlay } from './ui/hud-overlay';
import { ActionPanel } from './ui/action-panel';
import { NotificationSystem } from './ui/notification';
import { HoverCard3D } from './ui/hover-card-3d';
import { PropertyPanel } from './ui/property-panel';
import { AssetLoader } from '@infrastructure/asset-loader';
import { EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';
import { GameController } from '@application/game-controller';
import { createHumanPlayer, createAIPlayer } from '@game-logic/player/player-factory';

const logger = Logger.create('Main');

function updateSplash(progress: number, status: string): void {
  const fill = document.getElementById('progressFill') as HTMLElement | null;
  const statusEl = document.getElementById('splashStatus') as HTMLElement | null;
  if (fill) fill.style.width = `${progress}%`;
  if (statusEl) statusEl.textContent = status;
}

function hideSplash(): void {
  const splash = document.getElementById('splash');
  if (splash) { splash.classList.add('hidden'); setTimeout(() => splash.remove(), 600); }
}

async function main(): Promise<void> {
  updateSplash(5, 'Demarrage...');
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas introuvable');

  const sceneManager = new SceneManager(canvas);
  updateSplash(10, 'Scene...');

  const assetLoader = new AssetLoader(sceneManager.getScene());
  await assetLoader.loadAll({ onProgress: (p, s) => updateSplash(10 + p * 0.25, s) });

  updateSplash(40, 'Plateau 3D...');
  await sceneManager.initialize();
  const scene = sceneManager.getScene();
  const boardBuilder = sceneManager.getBoard()!;
  const eventBus = new EventBus();

  // Des
  updateSplash(50, 'Des...');
  const diceRenderer = new DiceRenderer(scene, eventBus);
  diceRenderer.setup();
  diceRenderer.connectEvents();

  // Batiments
  updateSplash(55, 'Batiments...');
  const buildingManager = new BuildingManager(scene, eventBus, boardBuilder);
  buildingManager.setup();
  buildingManager.connectEvents();

  // Highlight
  const squareHighlight = new SquareHighlight(scene);

  // Joueurs
  updateSplash(60, 'Joueurs...');
  const players = [createHumanPlayer('Vous', 0), createAIPlayer('Bot Alice', 1)];

  // Pions
  updateSplash(65, 'Pions...');
  const pawnController = new PawnController(scene, eventBus, boardBuilder);
  pawnController.createPawns(players);
  pawnController.connectEvents();

  // GameController
  updateSplash(70, 'Jeu...');
  const gameController = new GameController(players, eventBus);

  // Camera
  updateSplash(72, 'Camera...');
  const cameraController = sceneManager.getCamera()!;
  cameraController.connectEvents(eventBus, boardBuilder);

  // HUD
  updateSplash(75, 'Interface...');
  const hud = new HudOverlay(eventBus, () => gameController.getState());
  hud.setup();
  hud.connectEvents();

  // Action Panel
  updateSplash(80, 'Actions...');
  const actionPanel = new ActionPanel(eventBus, () => gameController.getState(), {
    rollDice: () => gameController.handleRollDice(),
    buyProperty: () => gameController.handleBuyProperty(),
    declineProperty: () => gameController.handleDeclineProperty(),
    endTurn: () => gameController.handleEndTurn(),
    payJailFine: () => gameController.handlePayJailFine(),
    useJailCard: () => gameController.handleUseJailCard(),
    buildHouse: (sq: number) => gameController.handleBuildHouse(sq),
  });
  actionPanel.setup();
  actionPanel.connectEvents();

  // Notifications
  updateSplash(85, 'Notifications...');
  const notifications = new NotificationSystem(eventBus);
  notifications.setup();
  notifications.connectEvents();

  // HoverCard3D — carte Monopoly 3D interactive au survol de la case du joueur
  updateSplash(89, 'Carte 3D interactive...');
  const hoverCard = new HoverCard3D(scene, boardBuilder, () => gameController.getState());
  hoverCard.setup();
  hoverCard.connectEvents(eventBus);

  // Property Panel (panneau de proprietes possedees)
  updateSplash(91, 'Panneau proprietes...');
  const propertyPanel = new PropertyPanel(eventBus, () => gameController.getState());
  propertyPanel.setup();
  propertyPanel.connectEvents();

  // Highlight case
  eventBus.on('pawn:moved', (data) => {
    const pos = boardBuilder.getSquarePosition(data.to);
    squareHighlight.show(pos);
  });
  eventBus.on('turn:started', (data) => {
    const player = gameController.getState().players.find((p) => p.id === data.playerId);
    if (player) squareHighlight.show(boardBuilder.getSquarePosition(player.position));
  });

  // Clavier
  setupKeyboard(gameController);
  setupEventLog(eventBus);

  (window as Record<string, unknown>).__game = gameController;
  (window as Record<string, unknown>).__bus = eventBus;

  updateSplash(95, 'Lancement...');
  sceneManager.startRenderLoop();
  updateSplash(100, 'Pret !');
  hideSplash();
  gameController.startGame();
  logger.info('Monopoly 3D demarre');
}

function setupKeyboard(ctrl: GameController): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const p = ctrl.getCurrentPlayer();
    if (p.isAI) return;
    switch (e.key) {
      case ' ': case 'Enter': e.preventDefault(); ctrl.handleRollDice(); break;
      case 'b': case 'B': ctrl.handleBuyProperty(); break;
      case 'n': case 'N': ctrl.handleDeclineProperty(); break;
      case 'e': case 'E': ctrl.handleEndTurn(); break;
      case 'p': case 'P': ctrl.handlePayJailFine(); break;
      case 'c': case 'C': ctrl.handleUseJailCard(); break;
    }
  });
}

function setupEventLog(bus: EventBus): void {
  const evts = [
    'game:started', 'game:ended', 'turn:started', 'turn:ended',
    'dice:rolled', 'dice:animation:complete', 'pawn:moved',
    'property:bought', 'rent:paid', 'card:drawn', 'building:placed',
    'player:jailed', 'player:released', 'player:bankrupt', 'player:balance:changed',
  ] as const;
  for (const ev of evts) bus.on(ev, (d: unknown) => logger.info(`[Event] ${ev}`, d));
}

main().catch((err: unknown) => console.error('[FATAL]', err));
