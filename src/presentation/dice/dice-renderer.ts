/**
 * DiceRenderer — Presentation Layer
 *
 * FIX VALEURS DES :
 * ─────────────────
 * Le probleme : quatFromUnitVectors avait un bug dans le cas anti-parallele
 * (dot < -0.999999). Il construisait un quaternion via FromEulerAngles en
 * passant les composantes du vecteur perpendiculaire comme angles, ce qui
 * est mathématiquement faux. Resultat : le snap final orientait le de
 * vers la mauvaise face.
 *
 * La correction : utiliser RotationAxis(perp, PI) qui fait correctement
 * une rotation de 180° autour de l axe perpendiculaire.
 *
 * [CERTAIN] API Babylon.js 7.x — Quaternion.RotationAxis, Vector3
 */

import {
  Scene, MeshBuilder, Mesh, Vector3, Vector4,
  Quaternion,
  PBRMaterial, DynamicTexture,
} from '@babylonjs/core';
import { type EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('DiceRenderer');

const DIE_SIZE = 0.45;
const DIE_SPACING = 0.8;
const GROUND_Y = 0.15;
const LAUNCH_Y = 4.0;
const PIP_TEX_SIZE = 256;

const GRAVITY = -18;
const BOUNCE = 0.3;
const LIN_FRIC = 0.965;
const ANG_FRIC = 0.955;
const GND_ANG = 0.88;
const SETTLE_V = 0.15;
const SETTLE_W = 0.3;
const SNAP_SPD = 0.08;
const STOP_V = 0.005;
const STOP_W = 0.02;
const DT = 1 / 60;
const MAX_F = 420;
// Délai de sécurité pour masquer les dés si aucun événement pawn:animation:complete n'arrive
const HIDE_MS_FALLBACK = 8000;

// ─── Faces CreateBox BJS ─────────────────────────────────────────────
// BJS CreateBox faceUV order :
//   [0]=bottom(−Y)  [1]=top(+Y)  [2]=front(−Z)  [3]=back(+Z)  [4]=right(+X)  [5]=left(−X)

const FACE_NORMALS: readonly Vector3[] = [
  new Vector3(0, -1, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, 0, -1),
  new Vector3(0, 0, 1),
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
];

// Valeurs dessinées sur chaque face (opposées = 7)
const FACE_VALUES: readonly number[] = [6, 1, 2, 5, 3, 4];

interface DS {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  q: Quaternion;
  wx: number; wy: number; wz: number;
  settling: boolean; settled: boolean;
}

// Pre-calcul des 24 orientations plates (6 faces × 4 rotations Y)
const FLAT_QUATS: Quaternion[] = [];
{
  const up = new Vector3(0, 1, 0);
  for (const normal of FACE_NORMALS) {
    const baseQ = quatFromUnitVectors(normal, up);
    for (let yi = 0; yi < 4; yi++) {
      FLAT_QUATS.push(baseQ.multiply(Quaternion.FromEulerAngles(0, (yi * Math.PI) / 2, 0)));
    }
  }
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
    logger.info('Des crees');
  }

  connectEvents(): void {
    this.eventBus.on('dice:rolled', (data) => {
      this.animateRoll(data.values[0], data.values[1], data.isDouble).catch((err) => {
        logger.error('Erreur animation des:', err);
      });
    });

    // Les dés restent visibles jusqu'à ce que le pion ait fini son animation
    this.eventBus.on('pawn:animation:complete', () => {
      this.hideDice();
    });
  }

  async animateRoll(v1: number, v2: number, isDouble: boolean): Promise<void> {
    if (!this.die1 || !this.die2 || this.rolling) return;
    this.rolling = true;
    this.die1.isVisible = true;
    this.die2.isVisible = true;

    await Promise.all([
      this.simDie(this.die1, v1, -DIE_SPACING / 2, 0),
      this.simDie(this.die2, v2, DIE_SPACING / 2, 120),
    ]);

    this.rolling = false;
    this.eventBus.emit('dice:animation:complete', { values: [v1, v2], isDouble });
    logger.info(`Des: ${v1} + ${v2}${isDouble ? ' (DOUBLE)' : ''}`);

    // Fallback : si aucun pion ne bouge (ex. 3 doubles → prison direct), masquer après délai
    setTimeout(() => this.hideDice(), HIDE_MS_FALLBACK);
  }

  private hideDice(): void {
    if (this.die1) this.die1.isVisible = false;
    if (this.die2) this.die2.isVisible = false;
  }

  isRolling(): boolean { return this.rolling; }

  // ═══════════════════════════════════════════════════════════════════
  //  CREATION
  // ═══════════════════════════════════════════════════════════════════

  private createDie(name: string): Mesh {
    const faceUV: Vector4[] = [];
    for (let i = 0; i < 6; i++) faceUV.push(new Vector4(i / 6, 0, (i + 1) / 6, 1));

    const die = MeshBuilder.CreateBox(name, { size: DIE_SIZE, faceUV, wrap: true }, this.scene);
    const mat = new PBRMaterial(`${name}-mat`, this.scene);
    mat.albedoTexture = this.genTex(name);
    mat.roughness = 0.25;
    mat.metallic = 0.02;
    mat.environmentIntensity = 0.5;
    mat.subSurface.isTranslucencyEnabled = false;
    die.material = mat;
    die.rotationQuaternion = Quaternion.Identity();
    return die;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TEXTURE
  // ═══════════════════════════════════════════════════════════════════

  private genTex(name: string): DynamicTexture {
    const tex = new DynamicTexture(`${name}-pips`, {
      width: PIP_TEX_SIZE * 6, height: PIP_TEX_SIZE,
    }, this.scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const s = PIP_TEX_SIZE;
    for (let i = 0; i < 6; i++) this.drawFace(ctx, i * s, 0, s, FACE_VALUES[i]!);
    tex.update();
    return tex;
  }

  private drawFace(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: number): void {
    const m = s * 0.06, r = s * 0.15, pr = s * 0.075;
    ctx.fillStyle = '#F5F0E8';
    ctx.beginPath(); ctx.roundRect(x + m, y + m, s - m * 2, s - m * 2, r); ctx.fill();
    ctx.strokeStyle = '#C8C0B0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x + m, y + m, s - m * 2, s - m * 2, r); ctx.stroke();
    ctx.fillStyle = '#1A1A1A';
    const cx = x + s / 2, cy = y + s / 2, d = s * 0.24;
    for (const p of this.pips(v, cx, cy, d)) {
      ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, Math.PI * 2); ctx.fill();
    }
  }

  private pips(v: number, cx: number, cy: number, d: number): Array<{ x: number; y: number }> {
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
  //  SIMULATION
  // ═══════════════════════════════════════════════════════════════════

  private simDie(die: Mesh, targetValue: number, offX: number, delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const rng = Math.random;
        const st: DS = {
          px: offX + (rng() - 0.5) * 0.3,
          py: LAUNCH_Y,
          pz: (rng() - 0.5) * 0.5,
          vx: (rng() - 0.5) * 4,
          vy: -1 - rng() * 3,
          vz: (rng() - 0.5) * 4,
          q: Quaternion.FromEulerAngles(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2),
          wx: (rng() - 0.5) * 18,
          wy: (rng() - 0.5) * 18,
          wz: (rng() - 0.5) * 18,
          settling: false, settled: false,
        };

        let frame = 0;

        const step = (): void => {
          frame++;
          if (st.settled || frame > MAX_F) {
            die.position.set(st.px, GROUND_Y + DIE_SIZE / 2, st.pz);
            die.rotationQuaternion!.copyFrom(this.quatForValueUp(targetValue));
            resolve();
            return;
          }

          const contact = GROUND_Y + DIE_SIZE / 2;

          st.vy += GRAVITY * DT;
          st.px += st.vx * DT;
          st.py += st.vy * DT;
          st.pz += st.vz * DT;

          const h = DT * 0.5;
          const dq = new Quaternion(st.wx * h, st.wy * h, st.wz * h, 0);
          const sp = dq.multiply(st.q);
          st.q.x += sp.x; st.q.y += sp.y; st.q.z += sp.z; st.q.w += sp.w;
          st.q.normalize();

          if (st.py < contact) {
            st.py = contact;
            if (st.vy < -0.3) {
              st.vy = -st.vy * BOUNCE;
              st.vx *= 0.65; st.vz *= 0.65;
              st.wx = st.wx * 0.55 + (rng() - 0.5) * 2;
              st.wy *= 0.6;
              st.wz = st.wz * 0.55 + (rng() - 0.5) * 2;
            } else { st.vy = 0; }
          }

          const lim = 4.5;
          if (Math.abs(st.px) > lim) { st.px = Math.sign(st.px) * lim; st.vx *= -0.4; }
          if (Math.abs(st.pz) > lim) { st.pz = Math.sign(st.pz) * lim; st.vz *= -0.4; }

          const onG = st.py <= contact + 0.01;
          const gf = onG ? 0.97 : 1;
          st.vx *= LIN_FRIC * gf; st.vz *= LIN_FRIC * gf;
          const af = onG ? GND_ANG : ANG_FRIC;
          st.wx *= af; st.wy *= af; st.wz *= af;

          const ls = Math.sqrt(st.vx ** 2 + st.vy ** 2 + st.vz ** 2);
          const as_ = Math.sqrt(st.wx ** 2 + st.wy ** 2 + st.wz ** 2);

          if (!st.settling && onG && ls < SETTLE_V && as_ < SETTLE_W) st.settling = true;

          if (st.settling && onG) {
            const near = nearestFlatQuat(st.q);
            Quaternion.SlerpToRef(st.q, near, SNAP_SPD, st.q);
            st.q.normalize();
            st.wx *= 0.78; st.wy *= 0.78; st.wz *= 0.78;
            st.py = st.py * 0.9 + contact * 0.1;
            st.vy *= 0.4;
            if (ls < STOP_V && as_ < STOP_W) st.settled = true;
          }

          die.position.set(st.px, st.py, st.pz);
          die.rotationQuaternion!.copyFrom(st.q);
          requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
      }, delayMs);
    });
  }

  /**
   * Quaternion qui place la face contenant `value` vers +Y.
   *
   * 1. Trouver l index i tel que FACE_VALUES[i] === value
   * 2. La normale locale de face i est FACE_NORMALS[i]
   * 3. quatFromUnitVectors(normale, +Y) donne la rotation
   */
  private quatForValueUp(value: number): Quaternion {
    const idx = FACE_VALUES.indexOf(value);
    if (idx === -1) return Quaternion.Identity();

    const normal = FACE_NORMALS[idx]!;
    const up = new Vector3(0, 1, 0);
    const baseQ = quatFromUnitVectors(normal, up);
    const yRot = Quaternion.FromEulerAngles(0, (Math.random() - 0.5) * 0.4, 0);
    return baseQ.multiply(yRot);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Quaternion qui tourne le vecteur unitaire `from` vers `to`.
 *
 * FIX : le cas anti-parallele (dot ≈ -1) utilisait FromEulerAngles
 * avec les composantes du perp comme angles — FAUX.
 * Correction : utiliser RotationAxis(perp, PI).
 */
function quatFromUnitVectors(from: Vector3, to: Vector3): Quaternion {
  const dot = Vector3.Dot(from, to);

  if (dot > 0.999999) {
    return Quaternion.Identity();
  }

  if (dot < -0.999999) {
    // Vecteurs anti-paralleles → rotation 180° autour d un axe perp
    let perp = Vector3.Cross(new Vector3(1, 0, 0), from);
    if (perp.lengthSquared() < 0.001) {
      perp = Vector3.Cross(new Vector3(0, 1, 0), from);
    }
    perp.normalize();
    // ┌─────────────────────────────────────────────────────────────┐
    // │ FIX : RotationAxis au lieu de FromEulerAngles(perp.xyz)    │
    // └─────────────────────────────────────────────────────────────┘
    return Quaternion.RotationAxis(perp, Math.PI);
  }

  const cross = Vector3.Cross(from, to);
  return new Quaternion(cross.x, cross.y, cross.z, 1 + dot).normalize();
}

function nearestFlatQuat(current: Quaternion): Quaternion {
  let best = FLAT_QUATS[0]!;
  let bestDot = -1;
  for (const cand of FLAT_QUATS) {
    const d = Math.abs(current.x * cand.x + current.y * cand.y + current.z * cand.z + current.w * cand.w);
    if (d > bestDot) { bestDot = d; best = cand; }
  }
  return best;
}
