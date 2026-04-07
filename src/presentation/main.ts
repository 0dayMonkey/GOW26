/**
 * Main — Presentation Layer (Point d entree)
 *
 * Bootstrap de Babylon.js, SceneManager, puis connexion
 * au GameController pour une partie jouable.
 */

import { SceneManager } from './scene-manager';
import { AssetLoader } from '@infrastructure/asset-loader';
import { EventBus } from '@infrastructure/event-bus';
import { Logger, LogLevel } from '@infrastructure/logger';
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
  updateSplash(15, 'Creation de la scene...');

  // 2. Charger les assets
  const assetLoader = new AssetLoader(sceneManager.getScene());
  await assetLoader.loadAll({
    onProgress: (progress, status) => {
      updateSplash(15 + progress * 0.6, status);
    },
  });

  // 3. Initialiser les sous-systemes visuels
  updateSplash(80, 'Construction du plateau 3D...');
  await sceneManager.initialize();

  // 4. Creer le jeu
  updateSplash(90, 'Preparation de la partie...');
  const eventBus = new EventBus();
  const players = [
    createHumanPlayer('Vous', 0),
    createAIPlayer('Bot Alice', 1),
  ];
  const gameController = new GameController(players, eventBus);

  // 5. Log des evenements en dev
  setupEventLogging(eventBus);

// 6. Stocker les references sur window pour debug
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  w.__game = gameController;
  w.__scene = sceneManager;
  w.__bus = eventBus;

  // 7. Demarrer le rendu
  updateSplash(100, 'Pret !');
  sceneManager.startRenderLoop();
  hideSplash();

  // 8. Demarrer la partie
  gameController.startGame();

  logger.info('Monopoly 3D demarre');
}

// ─── Debug : log tous les evenements ────────────────────────────────

function setupEventLogging(bus: EventBus): void {
  const events = [
    'game:started', 'game:ended',
    'turn:started', 'turn:ended',
    'dice:rolled', 'pawn:moved',
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
