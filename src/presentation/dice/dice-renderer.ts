/**
 * DiceRenderer — Presentation Layer
 *
 * Affiche 2 des 3D et anime le lancer.
 * Emet 'dice:animation:complete' quand l animation est terminee.
 * [CERTAIN] API Babylon.js 7.x
 */

import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  StandardMaterial,
  Color3,
  Animation,
  EasingFunction,
  BackEase,
} from '@babylonjs/core';
import { type EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('DiceRenderer');

const FRAME_RATE = 60;
const ROLL_FRAMES = 72; // ~1200ms
const DIE_SIZE = 0.35;
const DIE_Y = 1.5;
const DIE_SPACING = 0.6;
const HIDE_DELAY = 2000;

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

  /**
   * Creer les 2 des.
   */
  setup(): void {
    this.die1 = this.createDie('die-1', -DIE_SPACING / 2);
    this.die2 = this.createDie('die-2', DIE_SPACING / 2);

    this.die1.isVisible = false;
    this.die2.isVisible = false;

    logger.info('Des crees');
  }

  /**
   * Connecter au bus d evenements.
   */
  connectEvents(): void {
    this.eventBus.on('dice:rolled', (data) => {
      this.animateRoll(data.values[0], data.values[1], data.isDouble).catch((err) => {
        logger.error('Erreur animation des:', err);
      });
    });
  }

  /**
   * Animer le lancer, afficher le resultat, puis emettre dice:animation:complete.
   */
  async animateRoll(value1: number, value2: number, isDouble: boolean): Promise<void> {
    if (!this.die1 || !this.die2 || this.rolling) return;

    this.rolling = true;
    this.die1.isVisible = true;
    this.die2.isVisible = true;

    // Position de depart (au-dessus du plateau)
    this.die1.position.y = DIE_Y + 1.5;
    this.die2.position.y = DIE_Y + 1.5;

    await Promise.all([
      this.animateSingleDie(this.die1, value1, 0),
      this.animateSingleDie(this.die2, value2, 0.15),
    ]);

    // Orienter les des pour montrer la bonne face
    this.setDieFace(this.die1, value1);
    this.setDieFace(this.die2, value2);

    this.rolling = false;

    // Signaler que l animation est terminee → le GameController peut continuer
    this.eventBus.emit('dice:animation:complete', {
      values: [value1, value2],
      isDouble,
    });

    logger.info(`Animation des terminee: ${value1} + ${value2}${isDouble ? ' (DOUBLE)' : ''}`);

    // Masquer apres un delai
    setTimeout(() => {
      if (this.die1) this.die1.isVisible = false;
      if (this.die2) this.die2.isVisible = false;
    }, HIDE_DELAY);
  }

  /**
   * Les des sont-ils en train de rouler ?
   */
  isRolling(): boolean {
    return this.rolling;
  }

  // ─── Interne ───────────────────────────────────────────────────

  private createDie(name: string, offsetX: number): Mesh {
    const die = MeshBuilder.CreateBox(name, { size: DIE_SIZE }, this.scene);
    die.position = new Vector3(offsetX, DIE_Y, 0);

    const mat = new StandardMaterial(`${name}-mat`, this.scene);
    mat.diffuseColor = new Color3(0.95, 0.93, 0.88); // Blanc ivoire
    mat.specularColor = new Color3(0.4, 0.4, 0.4);
    mat.specularPower = 32;
    die.material = mat;

    return die;
  }

  private animateSingleDie(die: Mesh, _value: number, delay: number): Promise<void> {
    return new Promise((resolve) => {
      // Chute Y avec rebond
      const animY = new Animation(`${die.name}-y`, 'position.y', FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      animY.setKeys([
        { frame: 0, value: DIE_Y + 1.5 },
        { frame: ROLL_FRAMES * 0.4, value: DIE_Y - 0.2 },
        { frame: ROLL_FRAMES * 0.5, value: DIE_Y + 0.3 },
        { frame: ROLL_FRAMES * 0.7, value: DIE_Y - 0.05 },
        { frame: ROLL_FRAMES, value: DIE_Y },
      ]);

      // Rotation X (tournoiement)
      const animRotX = new Animation(`${die.name}-rotX`, 'rotation.x', FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      const spins = 2 + Math.random() * 3;
      animRotX.setKeys([
        { frame: 0, value: 0 },
        { frame: ROLL_FRAMES, value: Math.PI * 2 * spins },
      ]);

      // Rotation Z
      const animRotZ = new Animation(`${die.name}-rotZ`, 'rotation.z', FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      const spinsZ = 1 + Math.random() * 2;
      animRotZ.setKeys([
        { frame: 0, value: 0 },
        { frame: ROLL_FRAMES, value: Math.PI * 2 * spinsZ },
      ]);

      die.animations = [animY, animRotX, animRotZ];

      setTimeout(() => {
        this.scene.beginAnimation(die, 0, ROLL_FRAMES, false, 1, () => {
          resolve();
        });
      }, delay * 1000);
    });
  }

  /**
   * Orienter le de pour afficher la bonne face vers le haut.
   */
  private setDieFace(die: Mesh, value: number): void {
    const rotations: Record<number, { x: number; z: number }> = {
      1: { x: 0, z: 0 },
      2: { x: Math.PI / 2, z: 0 },
      3: { x: 0, z: -Math.PI / 2 },
      4: { x: 0, z: Math.PI / 2 },
      5: { x: -Math.PI / 2, z: 0 },
      6: { x: Math.PI, z: 0 },
    };

    const rot = rotations[value] ?? { x: 0, z: 0 };
    die.rotation.x = rot.x;
    die.rotation.z = rot.z;
    die.rotation.y = 0;
  }
}
