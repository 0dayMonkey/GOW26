/**
 * SceneManager — Presentation Layer
 *
 * Crée et gère le moteur Babylon.js, la scène, et orchestre
 * les sous-systèmes visuels (éclairage, caméra, plateau, etc.).
 * [CERTAIN] API Babylon.js 7.x
 */

import { Engine, Scene, Color4 } from '@babylonjs/core';
import { LightingSetup } from './lighting/lighting-setup';
import { CameraController } from './camera/camera-controller';
import { BoardMeshBuilder } from './board/board-mesh-builder';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('SceneManager');

export class SceneManager {
  private engine: Engine;
  private scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private lightingSetup: LightingSetup | null = null;
  private cameraController: CameraController | null = null;
  private boardMeshBuilder: BoardMeshBuilder | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Création du moteur — WebGPU si disponible, sinon WebGL2
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: true,
      adaptToDeviceRatio: true,
    });

    // Création de la scène
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.08, 0.08, 0.1, 1);

    // Optimisations de base
    this.scene.autoClear = false;
    this.scene.autoClearDepthAndStencil = true;

    logger.info('Moteur et scene crees');
  }

  /**
   * Initialiser tous les sous-systemes visuels.
   */
  async initialize(): Promise<void> {
    logger.info('Initialisation des sous-systemes visuels...');

    // Eclairage
    this.lightingSetup = new LightingSetup(this.scene);
    this.lightingSetup.setup();
    logger.info('Eclairage configure');

    // Camera
    this.cameraController = new CameraController(this.scene, this.canvas);
    this.cameraController.setup();
    logger.info('Camera configuree');

    // Plateau
    this.boardMeshBuilder = new BoardMeshBuilder(this.scene);
    this.boardMeshBuilder.build();
    logger.info('Plateau construit');

    // Attendre que la scene soit prete
    await this.scene.whenReadyAsync();
    logger.info('Scene prete');
  }

  /**
   * Demarrer la render loop.
   */
  startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    window.addEventListener('resize', () => {
      this.engine.resize();
    });

    logger.info('Render loop demarree');
  }

  /**
   * Acceder a la scene (pour les autres sous-systemes).
   */
  getScene(): Scene {
    return this.scene;
  }

  /**
   * Acceder au moteur.
   */
  getEngine(): Engine {
    return this.engine;
  }

  /**
   * Acceder au CameraController.
   */
  getCamera(): CameraController | null {
    return this.cameraController;
  }

  /**
   * Acceder au BoardMeshBuilder.
   */
  getBoard(): BoardMeshBuilder | null {
    return this.boardMeshBuilder;
  }

  /**
   * Nettoyage complet.
   */
  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
    logger.info('Scene et moteur disposes');
  }
}
