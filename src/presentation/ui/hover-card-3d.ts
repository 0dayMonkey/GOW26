/**
 * HoverCard3D — Presentation Layer (UI)
 *
 * Carte Monopoly 3D interactive apparaissant au survol de la case
 * ou se trouve le pion du joueur humain actif.
 *
 * Fonctionnement :
 * - UNE SEULE pick zone invisible, repositionnee a chaque deplacement
 *   du joueur humain (via EventBus pawn:moved / turn:started)
 * - Au survol souris de cette zone, un raycasting detecte le hit
 * - Une carte 3D (Plane + DynamicTexture) apparait avec animation
 *   "tirage de paquet" (slide + rotation + settle/rebond)
 * - La carte fait TOUJOURS face a la camera active (lookAt)
 * - La carte disparait avec animation inverse quand la souris quitte
 *
 * [CERTAIN] API Babylon.js 7.x — MeshBuilder.CreatePlane, DynamicTexture,
 *   Animation, Quaternion, scene.pick, ArcRotateCamera
 * [TRADE-OFF] Plane face camera vs Box avec faceUV :
 *   - Plane = UV mapping trivial (1 face), lookAt simple
 *   - Box = 6 faces, UV complexe, orientation ambigue
 *   - Decision : 2 Planes (recto + verso) pour la carte
 */

import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  Quaternion,
  StandardMaterial,
  PBRMaterial,
  DynamicTexture,
  Color3,
  Animation,
  EasingFunction,
  BackEase,
  CubicEase,
  Observer,
  PointerEventTypes,
  Texture,
  ArcRotateCamera,
  type PointerInfo,
} from '@babylonjs/core';
import { type EventBus } from '@infrastructure/event-bus';
import { type BoardMeshBuilder, type SquareWorldPosition } from '../board/board-mesh-builder';
import { BOARD_SQUARES } from '@game-logic/board/board-definition';
import {
  SquareType,
  ColorGroup,
  type Square,
  type PropertySquare,
  type StationSquare,
  type UtilitySquare,
  type TaxSquare,
  type GameState,
} from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('HoverCard3D');

// ─── Dimensions ──────────────────────────────────────────────────────

const CARD_WIDTH = 2.4;
const CARD_HEIGHT = 3.4;
const TEX_W = 512;
const TEX_H = 720;
const CARD_Y = 3.5;

// ─── Pick zone ───────────────────────────────────────────────────────

const PICK_ZONE_W = 1.0;
const PICK_ZONE_D = 1.4;

// ─── Animation ───────────────────────────────────────────────────────

const FRAME_RATE = 60;
const APPEAR_FRAMES = 26;
const DISAPPEAR_FRAMES = 16;

// ─── Couleurs groupes ────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  [ColorGroup.VIOLET]:     { bg: '#8B45A6', text: '#FFFFFF', border: '#6A2D80' },
  [ColorGroup.LIGHT_BLUE]: { bg: '#AAD8E6', text: '#1A1A1A', border: '#7BBCC9' },
  [ColorGroup.PINK]:       { bg: '#D93274', text: '#FFFFFF', border: '#B02060' },
  [ColorGroup.ORANGE]:     { bg: '#ED930F', text: '#FFFFFF', border: '#C47800' },
  [ColorGroup.RED]:        { bg: '#DB3328', text: '#FFFFFF', border: '#B01E18' },
  [ColorGroup.YELLOW]:     { bg: '#F1E634', text: '#1A1A1A', border: '#C8C020' },
  [ColorGroup.GREEN]:      { bg: '#1E8C2F', text: '#FFFFFF', border: '#146A22' },
  [ColorGroup.DARK_BLUE]:  { bg: '#003D99', text: '#FFFFFF', border: '#002B70' },
};

const CORNER_INDICES = new Set([0, 10, 20, 30]);

// ═══════════════════════════════════════════════════════════════════════

export class HoverCard3D {
  private readonly scene: Scene;
  private readonly boardBuilder: BoardMeshBuilder;
  private readonly getState: () => GameState;

  private pickZone: Mesh | null = null;
  private activeSquareIndex: number = -1;

  private cardFront: Mesh | null = null;
  private cardBack: Mesh | null = null;
  private cardParent: Mesh | null = null;
  private cardMat: PBRMaterial | null = null;
  private backMat: PBRMaterial | null = null;
  private cardTexture: DynamicTexture | null = null;
  private shadowPlane: Mesh | null = null;

  private currentSquareIndex: number = -1;
  private isAnimating = false;
  private isVisible = false;
  private pointerObserver: Observer<PointerInfo> | null = null;
  private idleObserver: Observer<Scene> | null = null;
  private idlePhase = 0;

  constructor(
    scene: Scene,
    boardBuilder: BoardMeshBuilder,
    getState: () => GameState,
  ) {
    this.scene = scene;
    this.boardBuilder = boardBuilder;
    this.getState = getState;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SETUP
  // ═══════════════════════════════════════════════════════════════════

  setup(): void {
    this.createPickZone();
    this.createCardMeshes();
    this.createShadowPlane();
    this.setupPointerEvents();
    logger.info('HoverCard3D initialise');
  }

  connectEvents(eventBus: EventBus): void {
    eventBus.on('pawn:moved', (data) => {
      const state = this.getState();
      const player = state.players.find((p) => p.id === data.playerId);
      if (player && !player.isAI) {
        this.updatePickZonePosition(data.to);
      }
    });

    eventBus.on('turn:started', (data) => {
      const state = this.getState();
      const player = state.players.find((p) => p.id === data.playerId);
      if (player && !player.isAI) {
        this.updatePickZonePosition(player.position);
      } else {
        this.disablePickZone();
        if (this.isVisible) this.forceHide();
      }
    });

    eventBus.on('player:jailed', (data) => {
      const state = this.getState();
      const player = state.players.find((p) => p.id === data.playerId);
      if (player && !player.isAI) {
        this.updatePickZonePosition(10);
      }
    });

    eventBus.on('game:ended', () => {
      this.disablePickZone();
      if (this.isVisible) this.forceHide();
    });

    logger.info('HoverCard3D evenements connectes');
  }

  dispose(): void {
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
    }
    this.stopIdleFloat();
    this.pickZone?.dispose();
    this.cardFront?.dispose();
    this.cardBack?.dispose();
    this.cardParent?.dispose();
    this.cardTexture?.dispose();
    this.cardMat?.dispose();
    this.backMat?.dispose();
    this.shadowPlane?.dispose();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PICK ZONE — unique, suit le joueur humain
  // ═══════════════════════════════════════════════════════════════════

  private createPickZone(): void {
    this.pickZone = MeshBuilder.CreateBox('hover-pick-zone', {
      width: PICK_ZONE_W,
      height: 0.01,
      depth: PICK_ZONE_D,
    }, this.scene);

    this.pickZone.isVisible = false;
    this.pickZone.isPickable = false;
    this.pickZone.metadata = { isHoverZone: true };
    this.pickZone.position.y = 0.17;
  }

  private updatePickZonePosition(squareIndex: number): void {
    if (!this.pickZone) return;

    if (CORNER_INDICES.has(squareIndex)) {
      this.disablePickZone();
      return;
    }

    const pos = this.boardBuilder.getSquarePosition(squareIndex);
    this.pickZone.position.x = pos.x;
    this.pickZone.position.z = pos.z;
    this.pickZone.rotation.y = pos.rotation;
    this.pickZone.isPickable = true;
    this.activeSquareIndex = squareIndex;

    if (this.isVisible && this.currentSquareIndex !== squareIndex) {
      this.forceHide();
    }
  }

  private disablePickZone(): void {
    if (!this.pickZone) return;
    this.pickZone.isPickable = false;
    this.activeSquareIndex = -1;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CARTE 3D — Plane recto + verso
  // ═══════════════════════════════════════════════════════════════════

  private createCardMeshes(): void {
    this.cardParent = new Mesh('hover-card-parent', this.scene);
    this.cardParent.isVisible = false;
    this.cardParent.isPickable = false;
    this.cardParent.rotationQuaternion = Quaternion.Identity();

    this.cardTexture = new DynamicTexture('hover-card-tex', {
      width: TEX_W, height: TEX_H,
    }, this.scene, true);
    this.cardTexture.hasAlpha = false;
    this.cardTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.cardTexture.wrapV = Texture.CLAMP_ADDRESSMODE;

    // Recto
    this.cardFront = MeshBuilder.CreatePlane('hover-card-front', {
      width: CARD_WIDTH, height: CARD_HEIGHT,
    }, this.scene);
    this.cardMat = new PBRMaterial('hover-card-mat', this.scene);
    this.cardMat.albedoTexture = this.cardTexture;
    this.cardMat.roughness = 0.5;
    this.cardMat.metallic = 0.0;
    this.cardMat.environmentIntensity = 0.35;
    this.cardMat.directIntensity = 1.1;
    this.cardMat.backFaceCulling = true;
    this.cardFront.material = this.cardMat;
    this.cardFront.parent = this.cardParent;
    this.cardFront.position = Vector3.Zero();
    this.cardFront.isPickable = false;

    // Verso
    this.cardBack = MeshBuilder.CreatePlane('hover-card-back', {
      width: CARD_WIDTH, height: CARD_HEIGHT,
    }, this.scene);
    this.backMat = new PBRMaterial('hover-card-back-mat', this.scene);
    this.backMat.albedoColor = new Color3(0.92, 0.90, 0.85);
    this.backMat.roughness = 0.6;
    this.backMat.metallic = 0.0;
    this.backMat.backFaceCulling = true;
    this.cardBack.material = this.backMat;
    this.cardBack.parent = this.cardParent;
    this.cardBack.rotation.y = Math.PI;
    this.cardBack.position.z = 0.005;
    this.cardBack.isPickable = false;
  }

  private createShadowPlane(): void {
    this.shadowPlane = MeshBuilder.CreatePlane('card-shadow', {
      width: CARD_WIDTH * 0.9, height: CARD_HEIGHT * 0.5,
    }, this.scene);
    const mat = new StandardMaterial('card-shadow-mat', this.scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.alpha = 0.0;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    this.shadowPlane.material = mat;
    this.shadowPlane.isVisible = false;
    this.shadowPlane.isPickable = false;
    this.shadowPlane.rotation.x = Math.PI / 2;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  POINTER EVENTS
  // ═══════════════════════════════════════════════════════════════════

  private setupPointerEvents(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        this.handlePointerMove();
      }
    });
  }

  private handlePointerMove(): void {
    if (this.activeSquareIndex < 0) return;

    const pickResult = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh.metadata?.isHoverZone === true,
    );

    if (pickResult?.hit && pickResult.pickedMesh === this.pickZone) {
      if (!this.isVisible && !this.isAnimating) {
        this.showCard(this.activeSquareIndex);
      }
    } else {
      if (this.isVisible && !this.isAnimating) {
        this.hideCard();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SHOW / HIDE
  // ═══════════════════════════════════════════════════════════════════

  private showCard(squareIndex: number): void {
    if (this.isAnimating || this.isVisible) return;
    if (CORNER_INDICES.has(squareIndex)) return;

    const square = BOARD_SQUARES[squareIndex];
    if (!square) return;

    this.currentSquareIndex = squareIndex;
    this.renderCardTexture(square, squareIndex);
    this.positionCardFacingCamera(squareIndex);
    this.animateAppear();
  }

  private hideCard(): void {
    if (!this.isVisible || this.isAnimating) return;
    this.animateDisappear();
  }

  private forceHide(): void {
    this.stopIdleFloat();
    if (this.cardParent) this.scene.stopAnimation(this.cardParent);
    if (this.shadowPlane) this.scene.stopAnimation(this.shadowPlane);
    if (this.cardParent) this.cardParent.isVisible = false;
    if (this.cardFront) this.cardFront.isVisible = false;
    if (this.cardBack) this.cardBack.isVisible = false;
    if (this.shadowPlane) this.shadowPlane.isVisible = false;
    this.isVisible = false;
    this.isAnimating = false;
    this.currentSquareIndex = -1;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  POSITIONNEMENT FACE CAMERA
  // ═══════════════════════════════════════════════════════════════════

  private positionCardFacingCamera(squareIndex: number): void {
    if (!this.cardParent) return;

    const squarePos = this.boardBuilder.getSquarePosition(squareIndex);
    const camera = this.scene.activeCamera as ArcRotateCamera;
    if (!camera) return;

    const camPos = camera.position.clone();
    const squareWorld = new Vector3(squarePos.x, 0, squarePos.z);

    // Direction horizontale case → camera
    const toCamera = new Vector3(camPos.x - squareWorld.x, 0, camPos.z - squareWorld.z);
    const dist = toCamera.length();
    if (dist > 0.001) toCamera.scaleInPlace(1 / dist);

    // Carte positionnee au-dessus de la case, legerement vers la camera
    const cardPos = new Vector3(
      squarePos.x + toCamera.x * 0.6,
      CARD_Y,
      squarePos.z + toCamera.z * 0.6,
    );

    this.cardParent.position.copyFrom(cardPos);

    // BJS CreatePlane : la face avant (front) pointe vers -Z en local
    // (systeme left-handed). Pour que le recto face la camera, le -Z local
    // doit pointer vers la camera → on ajoute PI au yaw.
    const yaw = Math.atan2(toCamera.x, toCamera.z) + Math.PI;
    // Legere inclinaison vers le joueur pour un effet premium
    const tiltBack = 0.1;
    this.cardParent.rotationQuaternion = Quaternion.FromEulerAngles(tiltBack, yaw, 0);

    // Ombre au sol
    if (this.shadowPlane) {
      this.shadowPlane.position.set(squarePos.x, 0.17, squarePos.z);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ANIMATIONS
  // ═══════════════════════════════════════════════════════════════════

  private animateAppear(): void {
    if (!this.cardParent) return;

    this.isAnimating = true;
    this.isVisible = true;
    this.cardParent.isVisible = true;
    this.cardFront!.isVisible = true;
    this.cardBack!.isVisible = true;
    if (this.shadowPlane) this.shadowPlane.isVisible = true;

    const finalPos = this.cardParent.position.clone();
    const finalQ = this.cardParent.rotationQuaternion!.clone();
    const startY = finalPos.y - 3.0;
    const extraTilt = Quaternion.FromEulerAngles(-0.5, 0, 0.15);
    const startQ = finalQ.multiply(extraTilt);

    this.cardParent.position.y = startY;
    this.cardParent.rotationQuaternion!.copyFrom(startQ);
    this.cardParent.scaling.setAll(0.5);

    const easeBack = new BackEase(0.35);
    easeBack.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);

    const animY = new Animation('cY', 'position.y', FRAME_RATE,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    animY.setKeys([
      { frame: 0, value: startY },
      { frame: Math.round(APPEAR_FRAMES * 0.7), value: finalPos.y + 0.2 },
      { frame: APPEAR_FRAMES, value: finalPos.y },
    ]);
    animY.setEasingFunction(easeBack);

    const mkScaleAnim = (prop: string): Animation => {
      const a = new Animation(`cS${prop}`, `scaling.${prop}`, FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      a.setKeys([
        { frame: 0, value: 0.5 },
        { frame: Math.round(APPEAR_FRAMES * 0.65), value: 1.06 },
        { frame: APPEAR_FRAMES, value: 1.0 },
      ]);
      a.setEasingFunction(easeBack);
      return a;
    };

    // Rotation Slerp
    let frame = 0;
    const slerpObs = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.cardParent) { this.scene.onBeforeRenderObservable.remove(slerpObs); return; }
      frame++;
      const t = Math.min(frame / APPEAR_FRAMES, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      Quaternion.SlerpToRef(startQ, finalQ, eased, this.cardParent.rotationQuaternion!);
      if (t >= 1) this.scene.onBeforeRenderObservable.remove(slerpObs);
    });

    if (this.shadowPlane) {
      const animSh = new Animation('shA', 'material.alpha', FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      animSh.setKeys([{ frame: 0, value: 0 }, { frame: APPEAR_FRAMES, value: 0.25 }]);
      this.shadowPlane.animations = [animSh];
      this.scene.beginAnimation(this.shadowPlane, 0, APPEAR_FRAMES, false);
    }

    this.cardParent.animations = [animY, mkScaleAnim('x'), mkScaleAnim('y'), mkScaleAnim('z')];
    this.scene.beginAnimation(this.cardParent, 0, APPEAR_FRAMES, false, 1, () => {
      this.isAnimating = false;
      this.cardParent!.position.copyFrom(finalPos);
      this.cardParent!.rotationQuaternion!.copyFrom(finalQ);
      this.cardParent!.scaling.setAll(1);
      this.startIdleFloat();
    });
  }

  private animateDisappear(): void {
    if (!this.cardParent) return;

    this.isAnimating = true;
    this.stopIdleFloat();

    const startY = this.cardParent.position.y;
    const endY = startY - 2.5;

    const easeCubic = new CubicEase();
    easeCubic.setEasingMode(EasingFunction.EASINGMODE_EASEIN);

    const animY = new Animation('cDY', 'position.y', FRAME_RATE,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    animY.setKeys([{ frame: 0, value: startY }, { frame: DISAPPEAR_FRAMES, value: endY }]);
    animY.setEasingFunction(easeCubic);

    const mkShrink = (prop: string): Animation => {
      const a = new Animation(`cD${prop}`, `scaling.${prop}`, FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      a.setKeys([{ frame: 0, value: 1 }, { frame: DISAPPEAR_FRAMES, value: 0.4 }]);
      a.setEasingFunction(easeCubic);
      return a;
    };

    const startQ = this.cardParent.rotationQuaternion!.clone();
    const tilt = Quaternion.FromEulerAngles(0.35, 0, -0.1);
    const endQ = startQ.multiply(tilt);
    let frame = 0;
    const slerpObs = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.cardParent) { this.scene.onBeforeRenderObservable.remove(slerpObs); return; }
      frame++;
      const t = Math.min(frame / DISAPPEAR_FRAMES, 1);
      Quaternion.SlerpToRef(startQ, endQ, t * t, this.cardParent.rotationQuaternion!);
      if (t >= 1) this.scene.onBeforeRenderObservable.remove(slerpObs);
    });

    if (this.shadowPlane) {
      const animSh = new Animation('shD', 'material.alpha', FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      animSh.setKeys([{ frame: 0, value: 0.25 }, { frame: DISAPPEAR_FRAMES, value: 0 }]);
      this.shadowPlane.animations = [animSh];
      this.scene.beginAnimation(this.shadowPlane, 0, DISAPPEAR_FRAMES, false);
    }

    this.cardParent.animations = [animY, mkShrink('x'), mkShrink('y'), mkShrink('z')];
    this.scene.beginAnimation(this.cardParent, 0, DISAPPEAR_FRAMES, false, 1, () => {
      this.cardParent!.isVisible = false;
      this.cardFront!.isVisible = false;
      this.cardBack!.isVisible = false;
      if (this.shadowPlane) this.shadowPlane.isVisible = false;
      this.isVisible = false;
      this.isAnimating = false;
      this.currentSquareIndex = -1;
    });
  }

  // ─── Idle float ────────────────────────────────────────────────

  private startIdleFloat(): void {
    this.idlePhase = 0;
    const baseY = this.cardParent!.position.y;
    this.idleObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.cardParent || !this.isVisible) return;
      this.idlePhase += 0.03;
      this.cardParent.position.y = baseY + Math.sin(this.idlePhase) * 0.04;
    });
  }

  private stopIdleFloat(): void {
    if (this.idleObserver) {
      this.scene.onBeforeRenderObservable.remove(this.idleObserver);
      this.idleObserver = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RENDU TEXTURE
  // ═══════════════════════════════════════════════════════════════════

  private renderCardTexture(square: Square, squareIndex: number): void {
    if (!this.cardTexture) return;
    const ctx = this.cardTexture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, TEX_W, TEX_H);

    switch (square.type) {
      case SquareType.PROPERTY:
        this.drawPropertyCard(ctx, square as PropertySquare, squareIndex);
        break;
      case SquareType.STATION:
        this.drawStationCard(ctx, square as StationSquare, squareIndex);
        break;
      case SquareType.UTILITY:
        this.drawUtilityCard(ctx, square as UtilitySquare, squareIndex);
        break;
      case SquareType.TAX:
        this.drawTaxCard(ctx, square as TaxSquare);
        break;
      case SquareType.CHANCE:
        this.drawChanceCard(ctx);
        break;
      case SquareType.COMMUNITY_CHEST:
        this.drawCommunityCard(ctx);
        break;
      default:
        this.drawGenericCard(ctx, square);
        break;
    }

    this.cardTexture.update();
  }

  // ─── PROPERTY ──────────────────────────────────────────────────

  private drawPropertyCard(ctx: CanvasRenderingContext2D, sq: PropertySquare, squareIndex: number): void {
    const c = GROUP_COLORS[sq.color] ?? { bg: '#999', text: '#fff', border: '#666' };
    this.drawCardBase(ctx);

    const bannerH = 145;
    ctx.fillStyle = c.bg;
    this.roundRectTop(ctx, 16, 16, TEX_W - 32, bannerH, 8); ctx.fill();
    ctx.strokeStyle = c.border; ctx.lineWidth = 3;
    this.roundRectTop(ctx, 16, 16, TEX_W - 32, bannerH, 8); ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.text;
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillText('TITRE DE PROPRIÉTÉ', TEX_W / 2, 48);

    ctx.font = 'bold 22px Georgia, serif';
    const lines = this.wrapText(ctx, sq.name.toUpperCase(), TEX_W - 80);
    const lineH = 26;
    const nameStartY = 88 + ((2 - lines.length) * lineH) / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, TEX_W / 2, nameStartY + i * lineH);
    }

    let y = bannerH + 36;
    ctx.fillStyle = '#1A1A1A'; ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('LOYER', 55, y);
    ctx.textAlign = 'right'; ctx.fillText(`${sq.rent[0]} €`, TEX_W - 55, y);

    y += 8;
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(TEX_W - 50, y); ctx.stroke();
    y += 16;

    const rentLabels = ['Avec 1 Maison', 'Avec 2 Maisons', 'Avec 3 Maisons', 'Avec 4 Maisons', 'Avec HÔTEL'];
    ctx.font = '14px Arial, sans-serif';
    for (let i = 0; i < 5; i++) {
      ctx.textAlign = 'left'; ctx.fillStyle = i === 4 ? '#B71C1C' : '#333';
      if (i === 4) ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText(rentLabels[i]!, 55, y);
      ctx.textAlign = 'right'; ctx.fillText(`${sq.rent[i + 1]} €`, TEX_W - 55, y);
      if (i === 4) ctx.font = '14px Arial, sans-serif';
      y += 24;
    }

    y += 4;
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(TEX_W - 50, y); ctx.stroke();
    y += 16;

    ctx.textAlign = 'left'; ctx.fillStyle = '#444'; ctx.font = '13px Arial, sans-serif';
    ctx.fillText("Prix d'une maison", 55, y);
    ctx.textAlign = 'right'; ctx.fillText(`${sq.houseCost} €`, TEX_W - 55, y);
    y += 22;
    ctx.textAlign = 'left'; ctx.fillText("Prix d'un hôtel", 55, y);
    ctx.textAlign = 'right'; ctx.fillText(`${sq.houseCost} € + 4🏠`, TEX_W - 55, y);

    y += 20;
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(TEX_W - 50, y); ctx.stroke();
    y += 22;

    ctx.textAlign = 'center'; ctx.fillStyle = '#1A1A1A';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText(`Prix d'achat : ${sq.price} €`, TEX_W / 2, y);

    y += 28;
    ctx.fillStyle = '#888'; ctx.font = 'italic 11px Arial, sans-serif';
    ctx.fillText('Si vous possédez TOUTES les propriétés', TEX_W / 2, y);
    ctx.fillText('de ce groupe, le loyer nu est doublé.', TEX_W / 2, y + 15);

    this.drawOwnerInfo(ctx, squareIndex);
  }

  // ─── STATION ───────────────────────────────────────────────────

  private drawStationCard(ctx: CanvasRenderingContext2D, sq: StationSquare, squareIndex: number): void {
    this.drawCardBase(ctx);
    const bannerH = 120;
    ctx.fillStyle = '#2C2C2C';
    this.roundRectTop(ctx, 16, 16, TEX_W - 32, bannerH, 8); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFF';
    ctx.font = '40px Arial'; ctx.fillText('🚂', TEX_W / 2, 60);
    ctx.font = 'bold 20px Georgia, serif'; ctx.fillText(sq.name, TEX_W / 2, 110);

    let y = bannerH + 50;
    const labels = ['1 Gare possédée', '2 Gares possédées', '3 Gares possédées', '4 Gares possédées'];
    const rents = [25, 50, 100, 200];
    ctx.font = '15px Arial, sans-serif';
    for (let i = 0; i < 4; i++) {
      ctx.textAlign = 'left'; ctx.fillStyle = i === 3 ? '#B71C1C' : '#333';
      if (i === 3) ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(labels[i]!, 55, y);
      ctx.textAlign = 'right'; ctx.fillText(`${rents[i]} €`, TEX_W - 55, y);
      if (i === 3) ctx.font = '15px Arial, sans-serif';
      y += 30;
    }
    y += 20;
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(TEX_W - 50, y); ctx.stroke();
    y += 28;
    ctx.textAlign = 'center'; ctx.fillStyle = '#1A1A1A';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText(`Prix d'achat : ${sq.price} €`, TEX_W / 2, y);
    this.drawOwnerInfo(ctx, squareIndex);
  }

  // ─── UTILITY ───────────────────────────────────────────────────

  private drawUtilityCard(ctx: CanvasRenderingContext2D, sq: UtilitySquare, squareIndex: number): void {
    this.drawCardBase(ctx);
    const isElec = sq.name.includes('lectricit');
    const bannerH = 120;
    ctx.fillStyle = '#5D4037';
    this.roundRectTop(ctx, 16, 16, TEX_W - 32, bannerH, 8); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFF';
    ctx.font = '40px Arial'; ctx.fillText(isElec ? '⚡' : '💧', TEX_W / 2, 60);
    ctx.font = 'bold 18px Georgia, serif'; ctx.fillText(sq.name, TEX_W / 2, 108);

    let y = bannerH + 50;
    ctx.fillStyle = '#333'; ctx.font = '14px Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('1 Compagnie possédée :', 55, y);
    ctx.textAlign = 'right'; ctx.font = 'bold 15px Arial, sans-serif';
    ctx.fillText('4 × le dé', TEX_W - 55, y);
    y += 35;
    ctx.font = '14px Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('2 Compagnies possédées :', 55, y);
    ctx.textAlign = 'right'; ctx.font = 'bold 15px Arial, sans-serif';
    ctx.fillStyle = '#B71C1C'; ctx.fillText('10 × le dé', TEX_W - 55, y);
    y += 50;
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(TEX_W - 50, y); ctx.stroke();
    y += 28;
    ctx.textAlign = 'center'; ctx.fillStyle = '#1A1A1A';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText(`Prix d'achat : ${sq.price} €`, TEX_W / 2, y);
    this.drawOwnerInfo(ctx, squareIndex);
  }

  // ─── TAX ───────────────────────────────────────────────────────

  private drawTaxCard(ctx: CanvasRenderingContext2D, sq: TaxSquare): void {
    this.drawCardBase(ctx);
    const bannerH = 130;
    ctx.fillStyle = '#455A64';
    this.roundRectTop(ctx, 16, 16, TEX_W - 32, bannerH, 8); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFF';
    ctx.font = '48px Arial'; ctx.fillText('💰', TEX_W / 2, 65);
    ctx.font = 'bold 20px Georgia, serif'; ctx.fillText(sq.name, TEX_W / 2, 115);
    ctx.fillStyle = '#B71C1C'; ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText(`Payez ${sq.amount} €`, TEX_W / 2, bannerH + 70);
    ctx.fillStyle = '#666'; ctx.font = 'italic 14px Arial, sans-serif';
    ctx.fillText('Taxe obligatoire', TEX_W / 2, bannerH + 120);
  }

  // ─── CHANCE ────────────────────────────────────────────────────

  private drawChanceCard(ctx: CanvasRenderingContext2D): void {
    this.drawCardBase(ctx);
    ctx.fillStyle = '#FFF3E0';
    this.roundRect(ctx, 18, 18, TEX_W - 36, TEX_H - 36, 6); ctx.fill();
    ctx.strokeStyle = '#E65100'; ctx.lineWidth = 4;
    this.roundRect(ctx, 28, 28, TEX_W - 56, TEX_H - 56, 4); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#E65100';
    ctx.font = 'bold 160px Georgia, serif'; ctx.fillText('?', TEX_W / 2, TEX_H / 2 - 40);
    ctx.font = 'bold 32px Georgia, serif'; ctx.fillText('CHANCE', TEX_W / 2, TEX_H / 2 + 80);
    ctx.fillStyle = '#BF360C'; ctx.font = 'italic 16px Arial, sans-serif';
    ctx.fillText('Tirez une carte', TEX_W / 2, TEX_H / 2 + 115);
  }

  // ─── COMMUNITY CHEST ──────────────────────────────────────────

  private drawCommunityCard(ctx: CanvasRenderingContext2D): void {
    this.drawCardBase(ctx);
    ctx.fillStyle = '#E3F2FD';
    this.roundRect(ctx, 18, 18, TEX_W - 36, TEX_H - 36, 6); ctx.fill();
    ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 4;
    this.roundRect(ctx, 28, 28, TEX_W - 56, TEX_H - 56, 4); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#1565C0';
    ctx.font = '120px Arial'; ctx.fillText('📦', TEX_W / 2, TEX_H / 2 - 50);
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('CAISSE DE', TEX_W / 2, TEX_H / 2 + 60);
    ctx.fillText('COMMUNAUTÉ', TEX_W / 2, TEX_H / 2 + 92);
    ctx.fillStyle = '#0D47A1'; ctx.font = 'italic 16px Arial, sans-serif';
    ctx.fillText('Tirez une carte', TEX_W / 2, TEX_H / 2 + 125);
  }

  // ─── GENERIC ───────────────────────────────────────────────────

  private drawGenericCard(ctx: CanvasRenderingContext2D, sq: Square): void {
    this.drawCardBase(ctx);
    ctx.textAlign = 'center'; ctx.fillStyle = '#333';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText(sq.name, TEX_W / 2, TEX_H / 2);
  }

  // ─── DRAWING HELPERS ───────────────────────────────────────────

  private drawCardBase(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    this.roundRect(ctx, 6, 8, TEX_W - 8, TEX_H - 8, 14); ctx.fill();
    ctx.fillStyle = '#FFFEF5';
    this.roundRect(ctx, 4, 4, TEX_W - 8, TEX_H - 8, 12); ctx.fill();
    ctx.strokeStyle = '#C8C0B0'; ctx.lineWidth = 2.5;
    this.roundRect(ctx, 4, 4, TEX_W - 8, TEX_H - 8, 12); ctx.stroke();
    ctx.strokeStyle = '#E0D8C8'; ctx.lineWidth = 1;
    this.roundRect(ctx, 12, 12, TEX_W - 24, TEX_H - 24, 8); ctx.stroke();
  }

  private drawOwnerInfo(ctx: CanvasRenderingContext2D, squareIndex: number): void {
    const state = this.getState();
    const owned = state.properties.find((p) => p.squareIndex === squareIndex);
    if (!owned) return;
    const owner = state.players.find((p) => p.id === owned.ownerId);
    if (!owner) return;
    const y = TEX_H - 40;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(46,125,50,0.15)';
    this.roundRect(ctx, 50, y - 14, TEX_W - 100, 28, 14); ctx.fill();
    ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 12px Arial, sans-serif';
    const icon = owner.isAI ? '🤖' : '👤';
    let text = `${icon} ${owner.name}`;
    if (owned.houses > 0 && owned.houses < 5) text += ` · ${'🏠'.repeat(owned.houses)}`;
    if (owned.houses === 5) text += ' · 🏨';
    ctx.fillText(text, TEX_W / 2, y);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private roundRectTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const words = text.split(' ');
    const result: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { result.push(line); line = w; }
      else line = test;
    }
    if (line) result.push(line);
    return result.length > 3 ? [text.substring(0, 20) + '…'] : result;
  }
}
