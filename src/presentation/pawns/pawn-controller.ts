/**
 * PawnController — Presentation Layer
 *
 * Gere le deplacement anime des pions sur le plateau.
 * Ecoute les evenements EventBus pour reagir aux mouvements.
 * [CERTAIN] API Babylon.js 7.x — Animation
 */

import {
  Scene,
  Vector3,
  Animation,
  SineEase,
  EasingFunction,
} from '@babylonjs/core';
import { type EventBus } from '@infrastructure/event-bus';
import { type PawnMesh, PawnFactory } from './pawn-factory';
import { type BoardMeshBuilder, type SquareWorldPosition } from '../board/board-mesh-builder';
import { type Player } from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('PawnController');

const FRAME_RATE = 60;
const MOVE_FRAMES = 18;  // ~300ms par case
const HOP_HEIGHT = 0.4;  // Hauteur du saut entre cases
const PAWN_Y = 0.3;      // Hauteur de base des pions
const PAWN_OFFSET = 0.15; // Decalage entre pions sur la meme case

export class PawnController {
  private readonly scene: Scene;
  private readonly eventBus: EventBus;
  private readonly boardBuilder: BoardMeshBuilder;
  private readonly pawnFactory: PawnFactory;
  private readonly pawns: Map<string, PawnMesh> = new Map();
  private animating = false;

  constructor(
    scene: Scene,
    eventBus: EventBus,
    boardBuilder: BoardMeshBuilder,
  ) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.boardBuilder = boardBuilder;
    this.pawnFactory = new PawnFactory(scene);
  }

  /**
   * Creer les pions pour tous les joueurs et les placer sur Depart.
   */
  createPawns(players: readonly Player[]): void {
    players.forEach((player, idx) => {
      const pawn = this.pawnFactory.createPawn(player.id, player.pawnIndex);
      this.pawns.set(player.id, pawn);

      // Placer sur la case Depart avec un leger decalage
      const startPos = this.boardBuilder.getSquarePosition(0);
      const offset = this.getPawnOffset(idx, players.length);
      pawn.mesh.position = new Vector3(
        startPos.x + offset.x,
        PAWN_Y,
        startPos.z + offset.z,
      );
    });

    logger.info(`${players.length} pions crees`);
  }

  /**
   * Connecter les evenements du bus.
   */
  connectEvents(): void {
    this.eventBus.on('pawn:moved', (data) => {
      this.animateMovement(data.playerId, data.steps as number[]).catch((err) => {
        logger.error('Erreur animation pion:', err);
      });
    });

    this.eventBus.on('player:jailed', (data) => {
      this.teleportToSquare(data.playerId, 10);
    });

    logger.info('Evenements pion connectes');
  }

  /**
   * Animer le deplacement case par case.
   */
  async animateMovement(playerId: string, steps: number[]): Promise<void> {
    const pawn = this.pawns.get(playerId);
    if (!pawn) return;

    this.animating = true;

    for (const stepIndex of steps) {
      const targetPos = this.boardBuilder.getSquarePosition(stepIndex);
      await this.animateHopToPosition(pawn, targetPos);
    }

    this.animating = false;
  }

  /**
   * Teleporter un pion instantanement (prison, etc).
   */
  teleportToSquare(playerId: string, squareIndex: number): void {
    const pawn = this.pawns.get(playerId);
    if (!pawn) return;

    const pos = this.boardBuilder.getSquarePosition(squareIndex);
    pawn.mesh.position = new Vector3(pos.x, PAWN_Y, pos.z);
  }

  /**
   * Est-on en train d animer ?
   */
  isAnimating(): boolean {
    return this.animating;
  }

  /**
   * Obtenir un pion par playerId.
   */
  getPawn(playerId: string): PawnMesh | undefined {
    return this.pawns.get(playerId);
  }

  // ─── Animation interne ─────────────────────────────────────────

  private animateHopToPosition(
    pawn: PawnMesh,
    target: SquareWorldPosition,
  ): Promise<void> {
    return new Promise((resolve) => {
      const mesh = pawn.mesh;
      const startPos = mesh.position.clone();
      const endPos = new Vector3(target.x, PAWN_Y, target.z);
      const midY = PAWN_Y + HOP_HEIGHT;

      const ease = new SineEase();
      ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);

      // Animation X
      const animX = new Animation('pawnX', 'position.x', FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      animX.setKeys([
        { frame: 0, value: startPos.x },
        { frame: MOVE_FRAMES, value: endPos.x },
      ]);
      animX.setEasingFunction(ease);

      // Animation Z
      const animZ = new Animation('pawnZ', 'position.z', FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      animZ.setKeys([
        { frame: 0, value: startPos.z },
        { frame: MOVE_FRAMES, value: endPos.z },
      ]);
      animZ.setEasingFunction(ease);

      // Animation Y (arc de saut)
      const animY = new Animation('pawnY', 'position.y', FRAME_RATE,
        Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      animY.setKeys([
        { frame: 0, value: startPos.y },
        { frame: MOVE_FRAMES / 2, value: midY },
        { frame: MOVE_FRAMES, value: PAWN_Y },
      ]);

      mesh.animations = [animX, animY, animZ];

      this.scene.beginAnimation(mesh, 0, MOVE_FRAMES, false, 1, () => {
        mesh.position = endPos;
        resolve();
      });
    });
  }

  /**
   * Decalage pour eviter que les pions se superposent sur une meme case.
   */
  private getPawnOffset(playerIndex: number, totalPlayers: number): { x: number; z: number } {
    const offsets = [
      { x: -PAWN_OFFSET, z: -PAWN_OFFSET },
      { x: PAWN_OFFSET, z: -PAWN_OFFSET },
      { x: -PAWN_OFFSET, z: PAWN_OFFSET },
      { x: PAWN_OFFSET, z: PAWN_OFFSET },
    ];
    return offsets[playerIndex] ?? { x: 0, z: 0 };
  }
}
