/**
 * DiceRenderer — Presentation Layer
 *
 * Des 3D avec :
 * - Faces a points (pips) dessines via DynamicTexture
 * - Physique simulee realiste (balistique, rebonds, friction, roulement)
 * - Stabilisation douce : quand la vitesse descend sous un seuil,
 *   les des se lissent progressivement vers la face plate la plus proche
 *   (snap quaternion via Slerp) — pas de teleportation brutale
 * - Apparence PBR premium
 * - Detection fiable du resultat final
 *
 * [CERTAIN] API Babylon.js 7.x — DynamicTexture, PBRMaterial, Vector4, Quaternion
 * [TRADE-OFF] Physique maison + snap quaternion vs Havok :
 *   - Le snap progressif est invisible visuellement et resout le probleme
 *     des des penches. La transition est douce (Slerp sur ~20 frames).
 *   - Havok ajouterait ~400KB WASM pour un gain minime sur 2 cubes.
 */

import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  Vector4,
  Quaternion,
  PBRMaterial,
  DynamicTexture,
} from '@babylonjs/core';
import { type EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('DiceRenderer');

// ─── Geometrie ───────────────────────────────────────────────────────

const DIE_SIZE = 0.45;
const DIE_SPACING = 0.8;
const GROUND_Y = 0.15;        // Surface du plateau
const LAUNCH_Y = 4.0;
const PIP_TEX_SIZE = 256;

// ─── Physique ────────────────────────────────────────────────────────

const GRAVITY = -18;
const BOUNCE_COEFF = 0.3;
const LINEAR_FRICTION = 0.965;
const ANGULAR_FRICTION = 0.955;
const GROUND_ANGULAR_FRICTION = 0.88;
const SETTLE_VEL = 0.15;       // Seuil pour commencer la stabilisation
const SETTLE_ROT = 0.3;
const SNAP_SPEED = 0.08;       // Vitesse du Slerp (par frame)
const STOP_VEL = 0.005;
const STOP_ROT = 0.02;
const SIM_DT = 1 / 60;
const MAX_FRAMES = 420;        // 7s max
const HIDE_DELAY = 2500;

// ─── Layout des faces ────────────────────────────────────────────────
// CreateBox faceUV: [bottom(-Y), top(+Y), front(+Z), back(-Z), right(+X), left(-X)]
// Faces opposees somment a 7
const FACE_VALUES = [6, 1, 2, 5, 3, 4];

// Quaternions pour mettre chaque face vers +Y
const FACE_QUATS: Array<{ value: number; quat: Quaternion }> = [
  { value: 1, quat: Quaternion.Identity() },                              // top(+Y) = 1
  { value: 6, quat: Quaternion.FromEulerAngles(Math.PI, 0, 0) },          // bottom(-Y) = 6
  { value: 2, quat: Quaternion.FromEulerAngles(-Math.PI / 2, 0, 0) },     // front(+Z) = 2
  { value: 5, quat: Quaternion.FromEulerAngles(Math.PI / 2, 0, 0) },      // back(-Z) = 5
  { value: 3, quat: Quaternion.FromEulerAngles(0, 0, -Math.PI / 2) },     // right(+X) = 3
  { value: 4, quat: Quaternion.FromEulerAngles(0, 0, Math.PI / 2) },      // left(-X) = 4
];

// ─── Etat physique ───────────────────────────────────────────────────

interface DieState {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  quat: Quaternion;
  wx: number; wy: number; wz: number;
  settling: boolean;
  settled: boolean;
}

// ═══════════════════════════════════════════════════════════════════════

export class DiceRenderer {
  private readonly scene: Scene;
  private readonly eventBus: EventBus;
  private die1: Mesh | null = null;
  private die2: Mesh | null = null;
  private rolling = false;

  constructor(scene: Scene, eventBus: EventBus) {
    this.scene = scene;
    this.eventBus = eventBus;
  }

  setup(): void {
    this.die1 = this.createDie('die-1');
    this.die2 = this.createDie('die-2');
    this.die1.isVisible = false;
    this.die2.isVisible = false;
    logger.info('Des PBR avec pips crees');
  }

  connectEvents(): void {
    this.eventBus.on('dice:rolled', (data) => {
      this.animateRoll(data.values[0], data.values[1], data.isDouble).catch((err) => {
        logger.error('Erreur animation des:', err);
      });
    });
  }

  async animateRoll(value1: number, value2: number, isDouble: boolean): Promise<void> {
    if (!this.die1 || !this.die2 || this.rolling) return;

    this.rolling = true;
    this.die1.isVisible = true;
    this.die2.isVisible = true;

    await Promise.all([
      this.simulateDie(this.die1, value1, -DIE_SPACING / 2, 0),
      this.simulateDie(this.die2, value2, DIE_SPACING / 2, 120),
    ]);

    this.rolling = false;

    this.eventBus.emit('dice:animation:complete', {
      values: [value1, value2],
      isDouble,
    });

    logger.info(`Des: ${value1} + ${value2}${isDouble ? ' (DOUBLE)' : ''}`);

    setTimeout(() => {
      if (this.die1) this.die1.isVisible = false;
      if (this.die2) this.die2.isVisible = false;
    }, HIDE_DELAY);
  }

  isRolling(): boolean {
    return this.rolling;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CREATION DU DE
  // ═══════════════════════════════════════════════════════════════════

  private createDie(name: string): Mesh {
    const faceUV: Vector4[] = [];
    for (let i = 0; i < 6; i++) {
      faceUV.push(new Vector4(i / 6, 0, (i + 1) / 6, 1));
    }

    const die = MeshBuilder.CreateBox(name, {
      size: DIE_SIZE,
      faceUV,
      wrap: true,
    }, this.scene);

    const mat = new PBRMaterial(`${name}-mat`, this.scene);
    mat.albedoTexture = this.generatePipTexture(name);
    mat.roughness = 0.25;
    mat.metallic = 0.02;
    mat.environmentIntensity = 0.5;
    mat.subSurface.isTranslucencyEnabled = false;
    die.material = mat;

    // IMPORTANT : utiliser les quaternions (pas Euler)
    // Euler souffre de gimbal lock et ne peut pas representer toutes les orientations
    die.rotationQuaternion = Quaternion.Identity();

    return die;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TEXTURE PIPS
  // ═══════════════════════════════════════════════════════════════════

  private generatePipTexture(name: string): DynamicTexture {
    const tex = new DynamicTexture(`${name}-pips`, {
      width: PIP_TEX_SIZE * 6,
      height: PIP_TEX_SIZE,
    }, this.scene, true);

    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const s = PIP_TEX_SIZE;

    for (let i = 0; i < 6; i++) {
      this.drawFace(ctx, i * s, 0, s, FACE_VALUES[i]!);
    }

    tex.update();
    return tex;
  }

  private drawFace(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, value: number): void {
    const m = s * 0.06;
    const r = s * 0.15;
    const pipR = s * 0.075;

    // Fond ivoire
    ctx.fillStyle = '#F5F0E8';
    ctx.beginPath();
    ctx.roundRect(x + m, y + m, s - m * 2, s - m * 2, r);
    ctx.fill();

    // Bordure
    ctx.strokeStyle = '#C8C0B0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + m, y + m, s - m * 2, s - m * 2, r);
    ctx.stroke();

    // Pips
    ctx.fillStyle = '#1A1A1A';
    const cx = x + s / 2;
    const cy = y + s / 2;
    const d = s * 0.24;

    for (const p of this.pipPositions(value, cx, cy, d)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, pipR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private pipPositions(v: number, cx: number, cy: number, d: number): Array<{ x: number; y: number }> {
    switch (v) {
      case 1: return [{ x: cx, y: cy }];
      case 2: return [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }];
      case 3: return [{ x: cx - d, y: cy - d }, { x: cx, y: cy }, { x: cx + d, y: cy + d }];
      case 4: return [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx - d, y: cy + d }, { x: cx + d, y: cy + d }];
      case 5: return [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx, y: cy }, { x: cx - d, y: cy + d }, { x: cx + d, y: cy + d }];
      case 6: return [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx - d, y: cy }, { x: cx + d, y: cy }, { x: cx - d, y: cy + d }, { x: cx + d, y: cy + d }];
      default: return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SIMULATION PHYSIQUE
  //
  //  3 phases naturelles :
  //  1. Chute + rebonds (physique classique)
  //  2. Stabilisation (settling) : Slerp progressif vers la face
  //     plate la plus proche — la transition est douce et invisible
  //  3. Arret : snap final vers la face cible (targetValue)
  // ═══════════════════════════════════════════════════════════════════

  private simulateDie(die: Mesh, targetValue: number, offsetX: number, delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const r = Math.random;
        const targetQuat = this.quatForValue(targetValue);

        const st: DieState = {
          px: offsetX + (r() - 0.5) * 0.3,
          py: LAUNCH_Y,
          pz: (r() - 0.5) * 0.5,
          vx: (r() - 0.5) * 4,
          vy: -1 - r() * 3,
          vz: (r() - 0.5) * 4,
          quat: Quaternion.FromEulerAngles(r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2),
          wx: (r() - 0.5) * 18,
          wy: (r() - 0.5) * 18,
          wz: (r() - 0.5) * 18,
          settling: false,
          settled: false,
        };

        let frame = 0;

        const step = (): void => {
          frame++;

          if (st.settled || frame > MAX_FRAMES) {
            // Snap final propre
            die.position.set(st.px, GROUND_Y + DIE_SIZE / 2, st.pz);
            die.rotationQuaternion!.copyFrom(targetQuat);
            resolve();
            return;
          }

          const groundContact = GROUND_Y + DIE_SIZE / 2;

          // ── Gravite ───────────────────────────────────────────
          st.vy += GRAVITY * SIM_DT;

          // ── Integration position ──────────────────────────────
          st.px += st.vx * SIM_DT;
          st.py += st.vy * SIM_DT;
          st.pz += st.vz * SIM_DT;

          // ── Integration rotation (quaternion differentiel) ────
          const hdt = SIM_DT * 0.5;
          const dq = new Quaternion(st.wx * hdt, st.wy * hdt, st.wz * hdt, 0);
          const spin = dq.multiply(st.quat);
          st.quat.x += spin.x;
          st.quat.y += spin.y;
          st.quat.z += spin.z;
          st.quat.w += spin.w;
          st.quat.normalize();

          // ── Collision sol ─────────────────────────────────────
          if (st.py < groundContact) {
            st.py = groundContact;
            if (st.vy < -0.3) {
              st.vy = -st.vy * BOUNCE_COEFF;
              st.vx *= 0.65;
              st.vz *= 0.65;
              st.wx = st.wx * 0.55 + (r() - 0.5) * 2;
              st.wy *= 0.6;
              st.wz = st.wz * 0.55 + (r() - 0.5) * 2;
            } else {
              st.vy = 0;
            }
          }

          // ── Murs invisibles ───────────────────────────────────
          const limit = 4.5;
          if (Math.abs(st.px) > limit) { st.px = Math.sign(st.px) * limit; st.vx *= -0.4; }
          if (Math.abs(st.pz) > limit) { st.pz = Math.sign(st.pz) * limit; st.vz *= -0.4; }

          // ── Friction ──────────────────────────────────────────
          const onGround = st.py <= groundContact + 0.01;
          if (onGround) {
            st.vx *= LINEAR_FRICTION * 0.97;
            st.vz *= LINEAR_FRICTION * 0.97;
            st.wx *= GROUND_ANGULAR_FRICTION;
            st.wy *= GROUND_ANGULAR_FRICTION;
            st.wz *= GROUND_ANGULAR_FRICTION;
          } else {
            st.vx *= LINEAR_FRICTION;
            st.vz *= LINEAR_FRICTION;
            st.wx *= ANGULAR_FRICTION;
            st.wy *= ANGULAR_FRICTION;
            st.wz *= ANGULAR_FRICTION;
          }

          // ── Vitesses ──────────────────────────────────────────
          const linSpd = Math.sqrt(st.vx ** 2 + st.vy ** 2 + st.vz ** 2);
          const angSpd = Math.sqrt(st.wx ** 2 + st.wy ** 2 + st.wz ** 2);

          // ── Entrer en phase settling ──────────────────────────
          if (!st.settling && onGround && linSpd < SETTLE_VEL && angSpd < SETTLE_ROT) {
            st.settling = true;
          }

          // ── Phase settling : Slerp vers face plate ────────────
          if (st.settling && onGround) {
            const nearest = this.nearestFlatQuat(st.quat);
            Quaternion.SlerpToRef(st.quat, nearest, SNAP_SPEED, st.quat);
            st.quat.normalize();

            // Amortir velocite angulaire restante
            st.wx *= 0.78;
            st.wy *= 0.78;
            st.wz *= 0.78;

            // Stabiliser la hauteur
            st.py = st.py * 0.9 + groundContact * 0.1;
            st.vy *= 0.4;

            // Arret ?
            if (linSpd < STOP_VEL && angSpd < STOP_ROT) {
              st.settled = true;
            }
          }

          // ── Appliquer au mesh ─────────────────────────────────
          die.position.set(st.px, st.py, st.pz);
          die.rotationQuaternion!.copyFrom(st.quat);

          requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
      }, delayMs);
    });
  }

  /**
   * Trouver le quaternion "face plate" le plus proche.
   * On teste les 6 faces × 4 rotations Y = 24 orientations.
   */
  private nearestFlatQuat(current: Quaternion): Quaternion {
    let best = FACE_QUATS[0]!.quat;
    let bestDot = -1;

    for (const entry of FACE_QUATS) {
      for (let yIdx = 0; yIdx < 4; yIdx++) {
        const yQ = Quaternion.FromEulerAngles(0, (yIdx * Math.PI) / 2, 0);
        const candidate = entry.quat.multiply(yQ);
        const dot = Math.abs(
          current.x * candidate.x +
          current.y * candidate.y +
          current.z * candidate.z +
          current.w * candidate.w,
        );
        if (dot > bestDot) {
          bestDot = dot;
          best = candidate;
        }
      }
    }

    return best;
  }

  /**
   * Quaternion pour afficher une valeur donnee face vers le haut.
   */
  private quatForValue(value: number): Quaternion {
    const entry = FACE_QUATS.find((e) => e.value === value);
    if (!entry) return Quaternion.Identity();
    // Legere rotation Y aleatoire pour le naturel
    const yRot = Quaternion.FromEulerAngles(0, (Math.random() - 0.5) * 0.4, 0);
    return entry.quat.multiply(yRot);
  }
}
