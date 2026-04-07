/**
 * CameraController — Presentation Layer
 *
 * Systeme de camera cinematique pour le Monopoly 3D.
 *
 * Comportements :
 * - Vue d ensemble par defaut (overview)
 * - Zoom intelligent sur la case quand un pion se deplace
 * - Zoom sur la zone de decision (achat, cartes)
 * - Ghost highlight semi-transparent sur la case d achat
 * - Transitions douces par Lerp/Slerp avec easing (~400-600ms)
 * - Retour fluide a la vue d ensemble apres chaque action
 *
 * [CERTAIN] API Babylon.js 7.x — ArcRotateCamera, Animation, Vector3
 * [TRADE-OFF] Lerp frame-par-frame dans onBeforeRender vs Animation BJS :
 *   - Lerp donne un controle total et s interrompt instantanement
 *   - Animation BJS est plus elegante mais plus difficile a interrompre
 *   - Decision : Lerp pour le gameplay (interruptions frequentes)
 */

import {
  Scene,
  ArcRotateCamera,
  Vector3,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  Color3,
  Observer,
} from '@babylonjs/core';
import { type EventBus } from '@infrastructure/event-bus';
import { type BoardMeshBuilder, type SquareWorldPosition } from '../board/board-mesh-builder';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('CameraController');

// ─── Presets ─────────────────────────────────────────────────────────

const OVERVIEW = {
  alpha: -Math.PI / 4,
  beta: 0.75,
  radius: 18,
  target: Vector3.Zero(),
};

const CLOSE_UP = {
  beta: 0.95,
  radius: 7,
};

const PURCHASE_VIEW = {
  beta: 0.85,
  radius: 8,
};

// ─── Easing ──────────────────────────────────────────────────────────

const LERP_SPEED = 0.04;          // Vitesse de base du Lerp (par frame)
const FAST_LERP = 0.06;           // Lerp rapide (retour overview)
const SLOW_LERP = 0.03;           // Lerp lent (zoom case)
const RETURN_DELAY = 2000;        // Delai avant retour a l overview (ms)

// ═══════════════════════════════════════════════════════════════════════

interface CameraTarget {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
  speed: number;
}

export class CameraController {
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private camera: ArcRotateCamera | null = null;

  // Systeme de Lerp
  private currentGoal: CameraTarget | null = null;
  private renderObserver: Observer<Scene> | null = null;

  // Ghost highlight
  private ghostMesh: Mesh | null = null;
  private ghostMat: StandardMaterial | null = null;

  // Timer retour overview
  private returnTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.camera.lowerRadiusLimit = 5;
    this.camera.upperRadiusLimit = 28;
    this.camera.lowerBetaLimit = 0.2;
    this.camera.upperBetaLimit = 1.45;

    // Damping fluide
    this.camera.inertia = 0.92;
    this.camera.panningInertia = 0.92;
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.pinchDeltaPercentage = 0.01;

    // Creer le ghost highlight
    this.createGhostMesh();

    // Demarrer le Lerp loop
    this.startLerpLoop();

    logger.info('Camera cinematique configuree');
  }

  /**
   * Connecter au bus d evenements pour les transitions automatiques.
   */
  connectEvents(eventBus: EventBus, boardBuilder: BoardMeshBuilder): void {
    // Quand un pion se deplace → zoom sur la case d arrivee
    eventBus.on('pawn:moved', (data) => {
      const pos = boardBuilder.getSquarePosition(data.to);
      this.goToSquare(pos);
    });

    // Quand c est le tour d un joueur → leger zoom sur sa position
    eventBus.on('turn:started', (data) => {
      // On ne zoom pas immediatement — on attend le lancer de des
      this.scheduleReturnToOverview(500);
    });

    // Quand les des sont lances → zoom vers le centre du plateau
    eventBus.on('dice:rolled', () => {
      this.goToDiceZone();
    });

    // Quand une action d achat est requise → zoom + ghost
    eventBus.on('ui:action:required', (data) => {
      if (data.type === 'buy-property' && data.context.squareIndex !== undefined) {
        const pos = boardBuilder.getSquarePosition(data.context.squareIndex);
        this.goToPurchase(pos);
      }
    });

    // Achat effectue → flash ghost puis retour
    eventBus.on('property:bought', (data) => {
      this.hideGhost();
      this.scheduleReturnToOverview(1500);
    });

    // Carte tiree → zoom centre
    eventBus.on('card:drawn', () => {
      this.cancelReturn();
      // On laisse la camera ou elle est — la card-display est en overlay
    });

    // Fin de tour → retour a l overview
    eventBus.on('turn:ended', () => {
      this.hideGhost();
      this.scheduleReturnToOverview(800);
    });

    // Joueur en prison → zoom prison
    eventBus.on('player:jailed', () => {
      // Case 10 = prison
      // On ne zoom pas forcement, la notification suffit
    });

    // Fin de partie → vue d ensemble
    eventBus.on('game:ended', () => {
      this.hideGhost();
      this.goToOverview();
    });

    logger.info('Evenements camera connectes');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Transition douce vers la vue d ensemble.
   */
  goToOverview(): void {
    this.cancelReturn();
    this.setGoal({
      alpha: OVERVIEW.alpha,
      beta: OVERVIEW.beta,
      radius: OVERVIEW.radius,
      target: OVERVIEW.target.clone(),
      speed: FAST_LERP,
    });
  }

  /**
   * Zoom sur une case du plateau.
   * La camera se positionne pour voir la case de face, legerement surelevatee.
   */
  goToSquare(pos: SquareWorldPosition): void {
    this.cancelReturn();
    const target = new Vector3(pos.x, 0, pos.z);
    const alpha = Math.atan2(pos.x, pos.z) + Math.PI;

    this.setGoal({
      alpha,
      beta: CLOSE_UP.beta,
      radius: CLOSE_UP.radius,
      target,
      speed: SLOW_LERP,
    });

    // Retour automatique a l overview apres un delai
    this.scheduleReturnToOverview(RETURN_DELAY);
  }

  /**
   * Zoom vers la zone des des (centre du plateau, legere surplomb).
   */
  goToDiceZone(): void {
    this.cancelReturn();
    this.setGoal({
      alpha: this.camera?.alpha ?? OVERVIEW.alpha,
      beta: 0.7,
      radius: 12,
      target: new Vector3(0, 0.5, 0),
      speed: LERP_SPEED,
    });
  }

  /**
   * Zoom pour la decision d achat : vue claire de la case + ghost highlight.
   */
  goToPurchase(pos: SquareWorldPosition): void {
    this.cancelReturn();
    const target = new Vector3(pos.x, 0, pos.z);
    const alpha = Math.atan2(pos.x, pos.z) + Math.PI;

    this.setGoal({
      alpha,
      beta: PURCHASE_VIEW.beta,
      radius: PURCHASE_VIEW.radius,
      target,
      speed: SLOW_LERP,
    });

    // Afficher le ghost highlight
    this.showGhost(pos);
  }

  /**
   * Obtenir la camera.
   */
  getCamera(): ArcRotateCamera | null {
    return this.camera;
  }

  /**
   * Nettoyage.
   */
  dispose(): void {
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    if (this.returnTimer) {
      clearTimeout(this.returnTimer);
    }
    if (this.ghostMesh) {
      this.ghostMesh.dispose();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SYSTEME LERP
  // ═══════════════════════════════════════════════════════════════════

  private setGoal(goal: CameraTarget): void {
    this.currentGoal = goal;
  }

  /**
   * Loop de Lerp executee chaque frame via onBeforeRenderObservable.
   * Interpole progressivement la camera vers le goal courant.
   * Pas de `new` dans cette boucle (conformite perf).
   */
  private startLerpLoop(): void {
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.camera || !this.currentGoal) return;

      const g = this.currentGoal;
      const s = g.speed;

      // Lerp alpha (avec gestion du wrap -PI..PI)
      let dAlpha = g.alpha - this.camera.alpha;
      // Normaliser la difference d angle
      while (dAlpha > Math.PI) dAlpha -= Math.PI * 2;
      while (dAlpha < -Math.PI) dAlpha += Math.PI * 2;
      this.camera.alpha += dAlpha * s;

      // Lerp beta
      this.camera.beta += (g.beta - this.camera.beta) * s;

      // Lerp radius
      this.camera.radius += (g.radius - this.camera.radius) * s;

      // Lerp target
      this.camera.target.x += (g.target.x - this.camera.target.x) * s;
      this.camera.target.y += (g.target.y - this.camera.target.y) * s;
      this.camera.target.z += (g.target.z - this.camera.target.z) * s;

      // Verifier si on est arrives (tolerances)
      const alphaDone = Math.abs(dAlpha) < 0.01;
      const betaDone = Math.abs(g.beta - this.camera.beta) < 0.005;
      const radiusDone = Math.abs(g.radius - this.camera.radius) < 0.05;
      const targetDone =
        Math.abs(g.target.x - this.camera.target.x) < 0.01 &&
        Math.abs(g.target.y - this.camera.target.y) < 0.01 &&
        Math.abs(g.target.z - this.camera.target.z) < 0.01;

      if (alphaDone && betaDone && radiusDone && targetDone) {
        // Snap final
        this.camera.alpha = g.alpha;
        this.camera.beta = g.beta;
        this.camera.radius = g.radius;
        this.camera.target.copyFrom(g.target);
        this.currentGoal = null;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  GHOST HIGHLIGHT
  // ═══════════════════════════════════════════════════════════════════

  private createGhostMesh(): void {
    this.ghostMesh = MeshBuilder.CreateBox('camera-ghost', {
      width: 1.2,
      height: 0.4,
      depth: 1.2,
    }, this.scene);

    this.ghostMat = new StandardMaterial('camera-ghost-mat', this.scene);
    this.ghostMat.diffuseColor = new Color3(0.3, 0.85, 0.4);
    this.ghostMat.emissiveColor = new Color3(0.15, 0.5, 0.2);
    this.ghostMat.alpha = 0.35;
    this.ghostMat.specularColor = Color3.Black();

    this.ghostMesh.material = this.ghostMat;
    this.ghostMesh.isVisible = false;
  }

  /**
   * Afficher le ghost sur une case.
   */
  showGhost(pos: SquareWorldPosition): void {
    if (!this.ghostMesh) return;
    this.ghostMesh.position = new Vector3(pos.x, 0.3, pos.z);
    this.ghostMesh.rotation.y = pos.rotation;
    this.ghostMesh.isVisible = true;

    // Pulse animation via alpha cycling
    let phase = 0;
    const pulseObs = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.ghostMesh || !this.ghostMesh.isVisible || !this.ghostMat) {
        this.scene.onBeforeRenderObservable.remove(pulseObs);
        return;
      }
      phase += 0.05;
      this.ghostMat.alpha = 0.25 + Math.sin(phase) * 0.12;
    });
  }

  /**
   * Masquer le ghost.
   */
  hideGhost(): void {
    if (this.ghostMesh) {
      this.ghostMesh.isVisible = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RETOUR AUTOMATIQUE
  // ═══════════════════════════════════════════════════════════════════

  private scheduleReturnToOverview(delayMs: number): void {
    this.cancelReturn();
    this.returnTimer = setTimeout(() => {
      this.goToOverview();
    }, delayMs);
  }

  private cancelReturn(): void {
    if (this.returnTimer) {
      clearTimeout(this.returnTimer);
      this.returnTimer = null;
    }
  }
}
