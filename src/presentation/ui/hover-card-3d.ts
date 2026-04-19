/**
 * HoverCard3D — Presentation Layer (UI)
 *
 * Carte Monopoly 3D au survol de la case du joueur humain.
 *
 * Architecture :
 * - UNE SEULE pick zone invisible, repositionnee uniquement quand
 *   le pion humain est VISUELLEMENT arrive a destination
 * - Verification temps-reel de la position via getState()
 * - Carte face camera (BJS left-handed : Plane face -Z → yaw + PI)
 *
 * Root cause du bug d indexage precedent :
 *   movePlayer() set player.position instantanement, mais le
 *   PawnController anime le pion en 300ms × N steps. Si on sync
 *   la pick zone sur pawn:moved, elle saute a la destination
 *   pendant que le pion est encore en animation sur une case
 *   intermediaire. Le joueur voit la carte de la destination,
 *   pas de la case ou le pion est visuellement.
 *
 * Solution : delai = steps.length × 320ms avant d activer la pick zone.
 *
 * [CERTAIN] API Babylon.js 7.x — CreatePlane, DynamicTexture, Animation
 * [TRADE-OFF] Delai calcule vs event pawn:animation:complete :
 *   - Le PawnController n emet pas pawn:animation:complete
 *   - Ajouter cet event couplerait les couches (a faire en refacto)
 *   - Decision : delai calcule, robust et decouple
 */

import {
  Scene, MeshBuilder, Mesh, Quaternion,
  StandardMaterial, PBRMaterial, DynamicTexture, Color3,
  Animation, EasingFunction, BackEase, CubicEase,
  Observer, PointerEventTypes, Texture, ArcRotateCamera,
  type PointerInfo,
} from '@babylonjs/core';
import { type EventBus } from '@infrastructure/event-bus';
import { type BoardMeshBuilder } from '../board/board-mesh-builder';
import { BOARD_SQUARES } from '@game-logic/board/board-definition';
import {
  SquareType, ColorGroup,
  type Square, type PropertySquare, type StationSquare,
  type UtilitySquare, type TaxSquare, type GameState,
} from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('HoverCard3D');

// ─── Carte ───────────────────────────────────────────────────────────

const CARD_W = 3.8;
const CARD_H = 5.4;
const TW = 660;
const TH = 940;
const CARD_Y = 4.5;

// ─── Pick zone ───────────────────────────────────────────────────────

const PZ_W = 1.1;
const PZ_D = 1.5;

// ─── Timing pion (doit matcher PawnController) ───────────────────────

const PAWN_MS_PER_STEP = 320; // 18 frames @ 60fps ≈ 300ms + marge

// ─── Animation carte ─────────────────────────────────────────────────

const FPS = 60;
const APPEAR_F = 26;
const DISAPPEAR_F = 16;

// ─── Couleurs groupes ────────────────────────────────────────────────

const GC: Record<string, { bg: string; tx: string; bd: string }> = {
  [ColorGroup.VIOLET]:     { bg: '#8B45A6', tx: '#FFF', bd: '#6A2D80' },
  [ColorGroup.LIGHT_BLUE]: { bg: '#AAD8E6', tx: '#1A1A1A', bd: '#7BBCC9' },
  [ColorGroup.PINK]:       { bg: '#D93274', tx: '#FFF', bd: '#B02060' },
  [ColorGroup.ORANGE]:     { bg: '#ED930F', tx: '#FFF', bd: '#C47800' },
  [ColorGroup.RED]:        { bg: '#DB3328', tx: '#FFF', bd: '#B01E18' },
  [ColorGroup.YELLOW]:     { bg: '#F1E634', tx: '#1A1A1A', bd: '#C8C020' },
  [ColorGroup.GREEN]:      { bg: '#1E8C2F', tx: '#FFF', bd: '#146A22' },
  [ColorGroup.DARK_BLUE]:  { bg: '#003D99', tx: '#FFF', bd: '#002B70' },
};

const NO_CARD = new Set([0, 10, 20, 30]);

// ═══════════════════════════════════════════════════════════════════════

export class HoverCard3D {
  private readonly scene: Scene;
  private readonly board: BoardMeshBuilder;
  private readonly getState: () => GameState;

  // Pick zone unique
  private pickZone: Mesh | null = null;
  private activeIdx = -1;

  // Carte 3D
  private cardParent: Mesh | null = null;
  private cardFront: Mesh | null = null;
  private cardBack: Mesh | null = null;
  private cardMat: PBRMaterial | null = null;
  private backMat: PBRMaterial | null = null;
  private tex: DynamicTexture | null = null;
  private shadow: Mesh | null = null;

  // Etat
  private showing = false;
  private animating = false;
  private shownIdx = -1;
  private ptrObs: Observer<PointerInfo> | null = null;
  private idleObs: Observer<Scene> | null = null;
  private idlePh = 0;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: Scene, board: BoardMeshBuilder, getState: () => GameState) {
    this.scene = scene;
    this.board = board;
    this.getState = getState;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SETUP + EVENTS
  // ═══════════════════════════════════════════════════════════════════

  setup(): void {
    this.buildPickZone();
    this.buildCard();
    this.buildShadow();
    this.ptrObs = this.scene.onPointerObservable.add((pi) => {
      if (pi.type === PointerEventTypes.POINTERMOVE) this.onPointer();
    });
    logger.info('HoverCard3D initialise');
  }

  connectEvents(eventBus: EventBus): void {
    // Pion humain bouge → sync APRES animation (delai calcule)
    eventBus.on('pawn:moved', (data) => {
      const hp = this.humanPlayer();
      if (!hp || data.playerId !== hp.id) return;

      // Desactiver immediatement (pion en mouvement)
      this.disable();
      if (this.showing) this.forceHide();

      // Activer apres la fin de l animation pion
      const delay = (data.steps?.length ?? 6) * PAWN_MS_PER_STEP + 200;
      this.scheduleSyncAfterDelay(delay);
    });

    // Debut de tour → sync immediate (pion au repos)
    eventBus.on('turn:started', () => {
      this.cancelScheduledSync();
      const hp = this.humanPlayer();
      if (!hp) return;

      const state = this.getState();
      const isMine = state.players[state.currentPlayerIndex]?.id === hp.id;
      if (isMine && !hp.inJail && !NO_CARD.has(hp.position)) {
        this.syncTo(hp.position);
      } else {
        this.disable();
        if (this.showing) this.forceHide();
      }
    });

    // Prison (toutes sources)
    eventBus.on('player:jailed', () => {
      this.cancelScheduledSync();
      this.disable();
      if (this.showing) this.forceHide();
    });

    // Carte tiree → peut changer la position (Go to Jail, Advance to...)
    eventBus.on('card:drawn', () => {
      this.cancelScheduledSync();
      this.disable();
      if (this.showing) this.forceHide();
      // Re-sync apres que l effet soit applique
      this.scheduleSyncAfterDelay(800);
    });

    eventBus.on('game:ended', () => {
      this.cancelScheduledSync();
      this.disable();
      this.forceHide();
    });

    logger.info('HoverCard3D events connectes');
  }

  dispose(): void {
    this.cancelScheduledSync();
    if (this.ptrObs) this.scene.onPointerObservable.remove(this.ptrObs);
    this.stopIdle();
    this.pickZone?.dispose();
    this.cardFront?.dispose();
    this.cardBack?.dispose();
    this.cardParent?.dispose();
    this.tex?.dispose();
    this.cardMat?.dispose();
    this.backMat?.dispose();
    this.shadow?.dispose();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SYNC — source de verite = getState()
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Programme un sync apres un delai (attente animation pion).
   * Annulable si un nouvel event arrive entre-temps.
   */
  private scheduleSyncAfterDelay(ms: number): void {
    this.cancelScheduledSync();
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.syncFromState();
    }, ms);
  }

  private cancelScheduledSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Lit la position reelle du joueur humain dans le GameState
   * et positionne la pick zone en consequence.
   */
  private syncFromState(): void {
    const hp = this.humanPlayer();
    if (!hp || hp.isBankrupt || hp.inJail) {
      this.disable();
      return;
    }

    const state = this.getState();
    const isMine = state.players[state.currentPlayerIndex]?.id === hp.id;
    if (!isMine) { this.disable(); return; }

    const pos = hp.position;
    if (NO_CARD.has(pos)) { this.disable(); return; }

    this.syncTo(pos);
  }

  /**
   * Place la pick zone sur une case donnee et l active.
   */
  private syncTo(squareIndex: number): void {
    if (!this.pickZone) return;
    if (this.activeIdx === squareIndex) return;

    const sp = this.board.getSquarePosition(squareIndex);
    this.pickZone.position.x = sp.x;
    this.pickZone.position.z = sp.z;
    this.pickZone.rotation.y = sp.rotation;
    this.pickZone.isPickable = true;
    this.activeIdx = squareIndex;

    if (this.showing && this.shownIdx !== squareIndex) {
      this.forceHide();
    }

    logger.info(`Pick zone → case ${squareIndex} (${BOARD_SQUARES[squareIndex]?.name})`);
  }

  private disable(): void {
    if (this.pickZone) this.pickZone.isPickable = false;
    this.activeIdx = -1;
  }

  private humanPlayer() {
    return this.getState().players.find((p) => !p.isAI);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PICK ZONE
  // ═══════════════════════════════════════════════════════════════════

  private buildPickZone(): void {
    this.pickZone = MeshBuilder.CreateBox('hcz', {
      width: PZ_W, height: 0.01, depth: PZ_D,
    }, this.scene);
    this.pickZone.isVisible = false;
    this.pickZone.isPickable = false;
    this.pickZone.metadata = { isHoverZone: true };
    this.pickZone.position.y = 0.17;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CARD MESH
  // ═══════════════════════════════════════════════════════════════════

  private buildCard(): void {
    this.cardParent = new Mesh('hcp', this.scene);
    this.cardParent.isVisible = false;
    this.cardParent.isPickable = false;
    this.cardParent.rotationQuaternion = Quaternion.Identity();

    this.tex = new DynamicTexture('hct', { width: TW, height: TH }, this.scene, true);
    this.tex.hasAlpha = false;
    this.tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.tex.wrapV = Texture.CLAMP_ADDRESSMODE;

    // Recto (face -Z en local BJS left-handed)
    this.cardFront = MeshBuilder.CreatePlane('hcf', { width: CARD_W, height: CARD_H }, this.scene);
    this.cardMat = new PBRMaterial('hcm', this.scene);
    this.cardMat.albedoTexture = this.tex;
    this.cardMat.roughness = 0.45;
    this.cardMat.metallic = 0.0;
    this.cardMat.environmentIntensity = 0.35;
    this.cardMat.directIntensity = 1.15;
    this.cardMat.backFaceCulling = true;
    this.cardFront.material = this.cardMat;
    this.cardFront.parent = this.cardParent;
    this.cardFront.isPickable = false;
    this.cardFront.isVisible = false; // [FIX] pas de carte fantome au demarrage

    // Verso
    this.cardBack = MeshBuilder.CreatePlane('hcb', { width: CARD_W, height: CARD_H }, this.scene);
    this.backMat = new PBRMaterial('hcbm', this.scene);
    this.backMat.albedoColor = new Color3(0.88, 0.85, 0.80);
    this.backMat.roughness = 0.6;
    this.backMat.metallic = 0.0;
    this.backMat.backFaceCulling = true;
    this.cardBack.material = this.backMat;
    this.cardBack.parent = this.cardParent;
    this.cardBack.rotation.y = Math.PI;
    this.cardBack.position.z = 0.005;
    this.cardBack.isPickable = false;
    this.cardBack.isVisible = false; // [FIX] pas de carte fantome au demarrage
  }

  private buildShadow(): void {
    this.shadow = MeshBuilder.CreatePlane('hcs', {
      width: CARD_W * 0.75, height: CARD_H * 0.35,
    }, this.scene);
    const m = new StandardMaterial('hcsm', this.scene);
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.alpha = 0;
    m.disableLighting = true;
    m.backFaceCulling = false;
    this.shadow.material = m;
    this.shadow.isVisible = false;
    this.shadow.isPickable = false;
    this.shadow.rotation.x = Math.PI / 2;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  POINTER
  // ═══════════════════════════════════════════════════════════════════

  private onPointer(): void {
    if (this.activeIdx < 0) return;

    // Double-check : position reelle du joueur = activeIdx ?
    const hp = this.humanPlayer();
    if (!hp || hp.position !== this.activeIdx || hp.inJail) {
      if (this.showing && !this.animating) this.hideCard();
      return;
    }

    const pick = this.scene.pick(
      this.scene.pointerX, this.scene.pointerY,
      (m) => m.metadata?.isHoverZone === true,
    );

    if (pick?.hit && pick.pickedMesh === this.pickZone) {
      if (!this.showing && !this.animating) this.showCard(this.activeIdx);
    } else {
      if (this.showing && !this.animating) this.hideCard();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SHOW / HIDE
  // ═══════════════════════════════════════════════════════════════════

  private showCard(idx: number): void {
    if (this.animating || this.showing || NO_CARD.has(idx)) return;
    const sq = BOARD_SQUARES[idx];
    if (!sq) return;

    this.shownIdx = idx;
    this.renderTex(sq, idx);
    this.orient(idx);
    this.animAppear();
  }

  private hideCard(): void {
    if (!this.showing || this.animating) return;
    this.animDisappear();
  }

  private forceHide(): void {
    this.stopIdle();
    if (this.cardParent) this.scene.stopAnimation(this.cardParent);
    if (this.shadow) this.scene.stopAnimation(this.shadow);
    this.setVis(false);
    this.showing = false;
    this.animating = false;
    this.shownIdx = -1;
  }

  private setVis(v: boolean): void {
    if (this.cardParent) this.cardParent.isVisible = v;
    if (this.cardFront) this.cardFront.isVisible = v;
    if (this.cardBack) this.cardBack.isVisible = v;
    if (this.shadow) this.shadow.isVisible = v;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ORIENT — face camera (BJS Plane face -Z → yaw + PI)
  // ═══════════════════════════════════════════════════════════════════

  private orient(idx: number): void {
    if (!this.cardParent) return;
    const sp = this.board.getSquarePosition(idx);
    const cam = this.scene.activeCamera as ArcRotateCamera;
    if (!cam) return;

    const cp = cam.position;
    const dx = cp.x - sp.x, dz = cp.z - sp.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const nx = d > 0.001 ? dx / d : 0, nz = d > 0.001 ? dz / d : 1;

    this.cardParent.position.set(sp.x + nx * 0.6, CARD_Y, sp.z + nz * 0.6);
    const yaw = Math.atan2(nx, nz) + Math.PI;
    this.cardParent.rotationQuaternion = Quaternion.FromEulerAngles(0.08, yaw, 0);

    if (this.shadow) this.shadow.position.set(sp.x, 0.17, sp.z);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ANIMATIONS
  // ═══════════════════════════════════════════════════════════════════

  private animAppear(): void {
    if (!this.cardParent) return;
    this.animating = true;
    this.showing = true;
    this.setVis(true);

    const fp = this.cardParent.position.clone();
    const fq = this.cardParent.rotationQuaternion!.clone();
    const sy = fp.y - 3;
    const sq = fq.multiply(Quaternion.FromEulerAngles(-0.5, 0, 0.12));

    this.cardParent.position.y = sy;
    this.cardParent.rotationQuaternion!.copyFrom(sq);
    this.cardParent.scaling.setAll(0.5);

    const eb = new BackEase(0.35);
    eb.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);

    const aY = new Animation('ay', 'position.y', FPS,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    aY.setKeys([
      { frame: 0, value: sy },
      { frame: Math.round(APPEAR_F * 0.7), value: fp.y + 0.18 },
      { frame: APPEAR_F, value: fp.y },
    ]);
    aY.setEasingFunction(eb);

    const mkS = (p: string): Animation => {
      const a = new Animation(`s${p}`, `scaling.${p}`, FPS,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      a.setKeys([
        { frame: 0, value: 0.5 },
        { frame: Math.round(APPEAR_F * 0.65), value: 1.05 },
        { frame: APPEAR_F, value: 1 },
      ]);
      a.setEasingFunction(eb);
      return a;
    };

    let f = 0;
    const so = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.cardParent) { this.scene.onBeforeRenderObservable.remove(so); return; }
      f++;
      const t = Math.min(f / APPEAR_F, 1);
      Quaternion.SlerpToRef(sq, fq, 1 - Math.pow(1 - t, 3), this.cardParent.rotationQuaternion!);
      if (t >= 1) this.scene.onBeforeRenderObservable.remove(so);
    });

    if (this.shadow) {
      const as = new Animation('sha', 'material.alpha', FPS,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      as.setKeys([{ frame: 0, value: 0 }, { frame: APPEAR_F, value: 0.25 }]);
      this.shadow.animations = [as];
      this.scene.beginAnimation(this.shadow, 0, APPEAR_F, false);
    }

    this.cardParent.animations = [aY, mkS('x'), mkS('y'), mkS('z')];
    this.scene.beginAnimation(this.cardParent, 0, APPEAR_F, false, 1, () => {
      this.animating = false;
      this.cardParent!.position.copyFrom(fp);
      this.cardParent!.rotationQuaternion!.copyFrom(fq);
      this.cardParent!.scaling.setAll(1);
      this.startIdle();
    });
  }

  private animDisappear(): void {
    if (!this.cardParent) return;
    this.animating = true;
    this.stopIdle();

    const sy = this.cardParent.position.y;
    const ec = new CubicEase();
    ec.setEasingMode(EasingFunction.EASINGMODE_EASEIN);

    const aY = new Animation('dy', 'position.y', FPS,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    aY.setKeys([{ frame: 0, value: sy }, { frame: DISAPPEAR_F, value: sy - 2.5 }]);
    aY.setEasingFunction(ec);

    const mkS = (p: string): Animation => {
      const a = new Animation(`d${p}`, `scaling.${p}`, FPS,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      a.setKeys([{ frame: 0, value: 1 }, { frame: DISAPPEAR_F, value: 0.4 }]);
      a.setEasingFunction(ec);
      return a;
    };

    const cq = this.cardParent.rotationQuaternion!.clone();
    const eq = cq.multiply(Quaternion.FromEulerAngles(0.3, 0, -0.08));
    let f = 0;
    const so = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.cardParent) { this.scene.onBeforeRenderObservable.remove(so); return; }
      f++;
      const t = Math.min(f / DISAPPEAR_F, 1);
      Quaternion.SlerpToRef(cq, eq, t * t, this.cardParent.rotationQuaternion!);
      if (t >= 1) this.scene.onBeforeRenderObservable.remove(so);
    });

    if (this.shadow) {
      const as = new Animation('shd', 'material.alpha', FPS,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      as.setKeys([{ frame: 0, value: 0.25 }, { frame: DISAPPEAR_F, value: 0 }]);
      this.shadow.animations = [as];
      this.scene.beginAnimation(this.shadow, 0, DISAPPEAR_F, false);
    }

    this.cardParent.animations = [aY, mkS('x'), mkS('y'), mkS('z')];
    this.scene.beginAnimation(this.cardParent, 0, DISAPPEAR_F, false, 1, () => {
      this.setVis(false);
      this.showing = false;
      this.animating = false;
      this.shownIdx = -1;
    });
  }

  private startIdle(): void {
    this.idlePh = 0;
    const by = this.cardParent!.position.y;
    this.idleObs = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.cardParent || !this.showing) return;
      this.idlePh += 0.03;
      this.cardParent.position.y = by + Math.sin(this.idlePh) * 0.04;
    });
  }

  private stopIdle(): void {
    if (this.idleObs) {
      this.scene.onBeforeRenderObservable.remove(this.idleObs);
      this.idleObs = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TEXTURE — Canvas 2D fidele Monopoly
  // ═══════════════════════════════════════════════════════════════════

  private renderTex(sq: Square, idx: number): void {
    if (!this.tex) return;
    const c = this.tex.getContext() as CanvasRenderingContext2D;
    c.clearRect(0, 0, TW, TH);

    switch (sq.type) {
      case SquareType.PROPERTY: this.drawProp(c, sq as PropertySquare, idx); break;
      case SquareType.STATION:  this.drawStation(c, sq as StationSquare, idx); break;
      case SquareType.UTILITY:  this.drawUtil(c, sq as UtilitySquare, idx); break;
      case SquareType.TAX:      this.drawTax(c, sq as TaxSquare); break;
      case SquareType.CHANCE:   this.drawChance(c); break;
      case SquareType.COMMUNITY_CHEST: this.drawComm(c); break;
      default:
        this.drawBase(c);
        c.textAlign = 'center'; c.fillStyle = '#333';
        c.font = 'bold 28px Georgia'; c.fillText(sq.name, TW / 2, TH / 2);
        break;
    }
    this.tex.update();
  }

  // ─── PROPERTY ──────────────────────────────────────────────────

  private drawProp(c: CanvasRenderingContext2D, sq: PropertySquare, idx: number): void {
    const g = GC[sq.color] ?? { bg: '#999', tx: '#fff', bd: '#666' };
    this.drawBase(c);

    const M = 18, bH = 210;
    c.fillStyle = g.bg;
    this.rrTop(c, M, M, TW - M * 2, bH, 10); c.fill();
    c.strokeStyle = g.bd; c.lineWidth = 4;
    this.rrTop(c, M, M, TW - M * 2, bH, 10); c.stroke();

    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = g.tx;
    c.font = 'bold 20px Arial'; c.fillText('TITRE DE PROPRIÉTÉ', TW / 2, 55);
    c.font = 'bold 36px Georgia';
    const ls = this.wrap(c, sq.name.toUpperCase(), TW - 80);
    const lh = 42, ny = 125 + ((2 - ls.length) * lh) / 2;
    for (let i = 0; i < ls.length; i++) c.fillText(ls[i]!, TW / 2, ny + i * lh);

    const mx = 55;
    let y = bH + 40;

    c.fillStyle = '#111'; c.font = 'bold 26px Arial';
    c.textAlign = 'left'; c.fillText('Loyer', mx, y);
    c.textAlign = 'right'; c.fillText(`${sq.rent[0]} €`, TW - mx, y);
    y += 10;
    c.strokeStyle = '#bbb'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(mx, y); c.lineTo(TW - mx, y); c.stroke();
    y += 28;

    c.font = '22px Arial'; c.fillStyle = '#333';
    c.textAlign = 'left'; c.fillText('Loyer avec monopole', mx, y);
    c.textAlign = 'right'; c.fillText(`${sq.rent[0] * 2} €`, TW - mx, y);
    y += 36;

    const rl = ['Loyer avec 🏠', 'Loyer avec 🏠🏠', 'Loyer avec 🏠🏠🏠', 'Loyer avec 🏠🏠🏠🏠', 'Loyer avec 🏨'];
    c.font = '22px Arial';
    for (let i = 0; i < 5; i++) {
      c.textAlign = 'left';
      c.fillStyle = i === 4 ? '#B71C1C' : '#333';
      if (i === 4) c.font = 'bold 23px Arial';
      c.fillText(rl[i]!, mx, y);
      c.textAlign = 'right';
      c.fillText(`${sq.rent[i + 1]} €`, TW - mx, y);
      if (i === 4) c.font = '22px Arial';
      y += 34;
    }

    y += 6;
    c.strokeStyle = '#bbb'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(mx, y); c.lineTo(TW - mx, y); c.stroke();
    y += 26;

    c.font = '20px Arial'; c.fillStyle = '#444';
    c.textAlign = 'left'; c.fillText('Maison', mx, y);
    c.textAlign = 'right'; c.fillText(`${sq.houseCost} € chaque`, TW - mx, y);
    y += 30;
    c.textAlign = 'left'; c.fillText('Hôtel', mx, y);
    c.textAlign = 'right'; c.fillText(`${sq.houseCost} € + 4 maisons`, TW - mx, y);

    y += 26;
    c.strokeStyle = '#999'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(mx, y); c.lineTo(TW - mx, y); c.stroke();
    y += 32;

    c.textAlign = 'center'; c.fillStyle = '#111';
    c.font = 'bold 28px Georgia';
    c.fillText(`Prix d'achat : ${sq.price} €`, TW / 2, y);

    this.drawOwner(c, idx);
  }

  // ─── STATION ───────────────────────────────────────────────────

  private drawStation(c: CanvasRenderingContext2D, sq: StationSquare, idx: number): void {
    this.drawBase(c);
    const M = 18, bH = 180;
    c.fillStyle = '#222';
    this.rrTop(c, M, M, TW - M * 2, bH, 10); c.fill();
    c.textAlign = 'center'; c.fillStyle = '#FFF';
    c.font = '60px Arial'; c.fillText('🚂', TW / 2, 80);
    c.font = 'bold 30px Georgia'; c.fillText(sq.name, TW / 2, 158);

    const mx = 55;
    let y = bH + 55;
    const lb = ['1 Gare possédée', '2 Gares possédées', '3 Gares possédées', '4 Gares possédées'];
    const rv = [25, 50, 100, 200];
    c.font = '24px Arial';
    for (let i = 0; i < 4; i++) {
      c.textAlign = 'left'; c.fillStyle = i === 3 ? '#B71C1C' : '#333';
      if (i === 3) c.font = 'bold 25px Arial';
      c.fillText(lb[i]!, mx, y);
      c.textAlign = 'right'; c.fillText(`${rv[i]} €`, TW - mx, y);
      if (i === 3) c.font = '24px Arial';
      y += 44;
    }
    y += 30;
    c.strokeStyle = '#999'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(mx, y); c.lineTo(TW - mx, y); c.stroke();
    y += 38;
    c.textAlign = 'center'; c.fillStyle = '#111';
    c.font = 'bold 28px Georgia';
    c.fillText(`Prix d'achat : ${sq.price} €`, TW / 2, y);
    this.drawOwner(c, idx);
  }

  // ─── UTILITY ───────────────────────────────────────────────────

  private drawUtil(c: CanvasRenderingContext2D, sq: UtilitySquare, idx: number): void {
    this.drawBase(c);
    const isE = sq.name.includes('lectricit');
    const M = 18, bH = 180;
    c.fillStyle = '#5D4037';
    this.rrTop(c, M, M, TW - M * 2, bH, 10); c.fill();
    c.textAlign = 'center'; c.fillStyle = '#FFF';
    c.font = '60px Arial'; c.fillText(isE ? '⚡' : '💧', TW / 2, 80);
    c.font = 'bold 26px Georgia'; c.fillText(sq.name, TW / 2, 155);

    const mx = 55;
    let y = bH + 60;
    c.font = '22px Arial'; c.fillStyle = '#333';
    c.textAlign = 'left'; c.fillText('1 Compagnie possédée :', mx, y);
    c.textAlign = 'right'; c.font = 'bold 24px Arial'; c.fillText('4 × le dé', TW - mx, y);
    y += 48;
    c.font = '22px Arial';
    c.textAlign = 'left'; c.fillText('2 Compagnies possédées :', mx, y);
    c.textAlign = 'right'; c.font = 'bold 24px Arial';
    c.fillStyle = '#B71C1C'; c.fillText('10 × le dé', TW - mx, y);
    y += 70;
    c.strokeStyle = '#999'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(mx, y); c.lineTo(TW - mx, y); c.stroke();
    y += 38;
    c.textAlign = 'center'; c.fillStyle = '#111';
    c.font = 'bold 28px Georgia';
    c.fillText(`Prix d'achat : ${sq.price} €`, TW / 2, y);
    this.drawOwner(c, idx);
  }

  // ─── TAX ───────────────────────────────────────────────────────

  private drawTax(c: CanvasRenderingContext2D, sq: TaxSquare): void {
    this.drawBase(c);
    const M = 18, bH = 190;
    c.fillStyle = '#455A64';
    this.rrTop(c, M, M, TW - M * 2, bH, 10); c.fill();
    c.textAlign = 'center'; c.fillStyle = '#FFF';
    c.font = '70px Arial'; c.fillText('💰', TW / 2, 85);
    c.font = 'bold 30px Georgia'; c.fillText(sq.name, TW / 2, 168);
    c.fillStyle = '#B71C1C'; c.font = 'bold 42px Georgia';
    c.fillText(`Payez ${sq.amount} €`, TW / 2, bH + 100);
    c.fillStyle = '#666'; c.font = 'italic 22px Arial';
    c.fillText('Taxe obligatoire', TW / 2, bH + 160);
  }

  // ─── CHANCE ────────────────────────────────────────────────────

  private drawChance(c: CanvasRenderingContext2D): void {
    this.drawBase(c);
    c.fillStyle = '#FFF3E0';
    this.rr(c, 22, 22, TW - 44, TH - 44, 8); c.fill();
    c.strokeStyle = '#E65100'; c.lineWidth = 5;
    this.rr(c, 36, 36, TW - 72, TH - 72, 5); c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#E65100';
    c.font = 'bold 240px Georgia'; c.fillText('?', TW / 2, TH / 2 - 40);
    c.font = 'bold 50px Georgia'; c.fillText('CHANCE', TW / 2, TH / 2 + 130);
    c.fillStyle = '#BF360C'; c.font = 'italic 24px Arial';
    c.fillText('Tirez une carte', TW / 2, TH / 2 + 180);
  }

  // ─── COMMUNITY ─────────────────────────────────────────────────

  private drawComm(c: CanvasRenderingContext2D): void {
    this.drawBase(c);
    c.fillStyle = '#E3F2FD';
    this.rr(c, 22, 22, TW - 44, TH - 44, 8); c.fill();
    c.strokeStyle = '#1565C0'; c.lineWidth = 5;
    this.rr(c, 36, 36, TW - 72, TH - 72, 5); c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#1565C0';
    c.font = '180px Arial'; c.fillText('📦', TW / 2, TH / 2 - 50);
    c.font = 'bold 36px Georgia';
    c.fillText('CAISSE DE', TW / 2, TH / 2 + 90);
    c.fillText('COMMUNAUTÉ', TW / 2, TH / 2 + 135);
    c.fillStyle = '#0D47A1'; c.font = 'italic 24px Arial';
    c.fillText('Tirez une carte', TW / 2, TH / 2 + 190);
  }

  // ─── HELPERS ───────────────────────────────────────────────────

  private drawBase(c: CanvasRenderingContext2D): void {
    c.fillStyle = 'rgba(0,0,0,0.1)';
    this.rr(c, 8, 10, TW - 10, TH - 10, 16); c.fill();
    c.fillStyle = '#FFFEF5';
    this.rr(c, 5, 5, TW - 10, TH - 10, 14); c.fill();
    c.strokeStyle = '#C0B8A8'; c.lineWidth = 3;
    this.rr(c, 5, 5, TW - 10, TH - 10, 14); c.stroke();
    c.strokeStyle = '#DDD8CC'; c.lineWidth = 1.5;
    this.rr(c, 14, 14, TW - 28, TH - 28, 8); c.stroke();
  }

  private drawOwner(c: CanvasRenderingContext2D, idx: number): void {
    const ow = this.getState().properties.find((p) => p.squareIndex === idx);
    if (!ow) return;
    const pl = this.getState().players.find((p) => p.id === ow.ownerId);
    if (!pl) return;
    const y = TH - 50;
    c.textAlign = 'center';
    c.fillStyle = 'rgba(46,125,50,0.12)';
    this.rr(c, 55, y - 18, TW - 110, 36, 18); c.fill();
    c.fillStyle = '#2E7D32'; c.font = 'bold 18px Arial';
    let t = `${pl.isAI ? '🤖' : '👤'} ${pl.name}`;
    if (ow.houses > 0 && ow.houses < 5) t += ` · ${'🏠'.repeat(ow.houses)}`;
    if (ow.houses === 5) t += ' · 🏨';
    c.fillText(t, TW / 2, y);
  }

  private rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  private rrTop(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h); c.lineTo(x, y + h);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  private wrap(c: CanvasRenderingContext2D, t: string, mw: number): string[] {
    const ws = t.split(' '), r: string[] = []; let l = '';
    for (const w of ws) {
      const x = l ? `${l} ${w}` : w;
      if (c.measureText(x).width > mw && l) { r.push(l); l = w; } else l = x;
    }
    if (l) r.push(l);
    return r.length > 3 ? [t.substring(0, 20) + '…'] : r;
  }
}
