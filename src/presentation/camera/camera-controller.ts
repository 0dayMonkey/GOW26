/**
 * CameraController — Presentation Layer
 *
 * Camera orbitale ArcRotateCamera avec transitions animees
 * pour les evenements de jeu (zoom case, vue d ensemble).
 * [CERTAIN] API Babylon.js 7.x
 */

import {
  Scene,
  ArcRotateCamera,
  Vector3,
  Animation,
  CubicEase,
  EasingFunction,
} from '@babylonjs/core';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('CameraController');

// Presets de camera
const OVERVIEW = { alpha: -Math.PI / 4, beta: 0.8, radius: 20, target: Vector3.Zero() };
const CLOSE_UP = { beta: 1.1, radius: 10 };
const TRANSITION_FRAMES = 48; // ~800ms a 60fps
const FRAME_RATE = 60;

export class CameraController {
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private camera: ArcRotateCamera | null = null;
  private isAnimating = false;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.canvas = canvas;
  }

  /**
   * Configurer la camera initiale.
   */
  setup(): void {
    this.camera = new ArcRotateCamera(
      'main-camera',
      OVERVIEW.alpha,
      OVERVIEW.beta,
      OVERVIEW.radius,
      OVERVIEW.target.clone(),
      this.scene,
    );

    this.camera.attachControl(this.canvas, true);

    // Limites
    this.camera.lowerRadiusLimit = 6;
    this.camera.upperRadiusLimit = 30;
    this.camera.lowerBetaLimit = 0.3;
    this.camera.upperBetaLimit = 1.4;

    // Damping pour mouvement fluide
    this.camera.inertia = 0.9;
    this.camera.panningInertia = 0.9;

    // Sensibilite souris/touch
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.pinchDeltaPercentage = 0.01;

    logger.info('Camera configuree (vue d ensemble)');
  }

  /**
   * Transition animee vers la vue d ensemble.
   */
  goToOverview(): void {
    if (!this.camera) return;
    this.animateTo(OVERVIEW.alpha, OVERVIEW.beta, OVERVIEW.radius, OVERVIEW.target.clone());
  }

  /**
   * Transition animee vers une case du plateau (close-up).
   */
  goToSquare(worldX: number, worldZ: number): void {
    if (!this.camera) return;
    const target = new Vector3(worldX, 0, worldZ);
    // Calculer l alpha pour regarder la case de face
    const alpha = Math.atan2(worldX, worldZ) + Math.PI;
    this.animateTo(alpha, CLOSE_UP.beta, CLOSE_UP.radius, target);
  }

  /**
   * Obtenir la camera.
   */
  getCamera(): ArcRotateCamera | null {
    return this.camera;
  }

  /**
   * Est-on en train d animer ?
   */
  getIsAnimating(): boolean {
    return this.isAnimating;
  }

  // ─── Animation interne ─────────────────────────────────────────

  private animateTo(alpha: number, beta: number, radius: number, target: Vector3): void {
    if (!this.camera || this.isAnimating) return;

    this.isAnimating = true;

    // Desactiver le controle utilisateur pendant l animation
    this.camera.detachControl();

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);

    const animations: Animation[] = [];

    // Alpha
    const alphaAnim = new Animation('camAlpha', 'alpha', FRAME_RATE, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    alphaAnim.setKeys([
      { frame: 0, value: this.camera.alpha },
      { frame: TRANSITION_FRAMES, value: alpha },
    ]);
    alphaAnim.setEasingFunction(ease);
    animations.push(alphaAnim);

    // Beta
    const betaAnim = new Animation('camBeta', 'beta', FRAME_RATE, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    betaAnim.setKeys([
      { frame: 0, value: this.camera.beta },
      { frame: TRANSITION_FRAMES, value: beta },
    ]);
    betaAnim.setEasingFunction(ease);
    animations.push(betaAnim);

    // Radius
    const radiusAnim = new Animation('camRadius', 'radius', FRAME_RATE, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    radiusAnim.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: TRANSITION_FRAMES, value: radius },
    ]);
    radiusAnim.setEasingFunction(ease);
    animations.push(radiusAnim);

    // Target
    const targetAnim = new Animation('camTarget', 'target', FRAME_RATE, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    targetAnim.setKeys([
      { frame: 0, value: this.camera.target.clone() },
      { frame: TRANSITION_FRAMES, value: target },
    ]);
    targetAnim.setEasingFunction(ease);
    animations.push(targetAnim);

    this.camera.animations = animations;

    this.scene.beginAnimation(this.camera, 0, TRANSITION_FRAMES, false, 1, () => {
      this.isAnimating = false;
      if (this.camera) {
        this.camera.attachControl(this.canvas, true);
      }
      logger.debug('Transition camera terminee');
    });
  }
}
