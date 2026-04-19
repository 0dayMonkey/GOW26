/**
 * BoardMeshBuilder — Presentation Layer
 *
 * Construction du plateau Monopoly 3D avec texture baked generee dynamiquement.
 *
 * Changements par rapport a la version precedente (Phase 4) :
 * - Le plateau est un SEUL mesh plan avec la texture 2048x2048 generee
 *   par board-texture-generator.ts (au lieu de 40+ boxes individuels)
 * - Les positions 3D de chaque case restent calculees pour le placement
 *   des pions, batiments et highlights
 * - Un cadre 3D en relief entoure le plateau pour l aspect premium
 * - Fallback procedural conserve si la texture echoue
 *
 * [CERTAIN] API Babylon.js 7.x — MeshBuilder, PBRMaterial, DynamicTexture
 * [TRADE-OFF] Mesh unique + texture baked vs 40 meshes individuels :
 *   - 1 draw call au lieu de 40+ → performance nettement meilleure
 *   - Lisibilite et identite visuelle bien superieures
 *   - Perte de la possibilite de highlight individual par mesh (compense par SquareHighlight)
 */

import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  StandardMaterial,
  PBRMaterial,
  Color3,
} from '@babylonjs/core';
import { generateMonopolyBoardTexture } from './board-texture-generator';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('BoardMeshBuilder');

// ─── Dimensions (unites monde) ───────────────────────────────────────

const BOARD_TOTAL = 11;        // Taille totale du plateau
const CORNER_SIZE = 1.4;       // Taille d un coin
const SIDE_COUNT = 9;          // Cases par cote (hors coins)
const SIDE_LENGTH = BOARD_TOTAL - 2 * CORNER_SIZE;
const CELL_WIDTH = SIDE_LENGTH / SIDE_COUNT;
const CELL_DEPTH = CORNER_SIZE;
const BOARD_HEIGHT = 0.15;     // Epaisseur du plateau

// ─── Position monde d une case ───────────────────────────────────────

export interface SquareWorldPosition {
  x: number;
  z: number;
  rotation: number; // radians autour de Y
}

// ═══════════════════════════════════════════════════════════════════════

export class BoardMeshBuilder {
  private readonly scene: Scene;
  private readonly squarePositions: SquareWorldPosition[] = [];
  private boardBase: Mesh | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.computeSquarePositions();
  }

  /**
   * Construire le plateau avec la texture baked.
   * Si la generation echoue, utilise le fallback procedural.
   */
  build(): void {
    try {
      this.buildTexturedBoard();
      this.buildFrame();
      logger.info('Plateau texture construit (1 draw call)');
    } catch (err: unknown) {
      logger.warn('Echec texture baked, fallback procedural', err);
      this.buildFallbackBoard();
    }
  }

  /**
   * Position monde d une case par index (0..39).
   */
  getSquarePosition(index: number): SquareWorldPosition {
    const pos = this.squarePositions[index];
    if (!pos) throw new Error(`Case ${index} invalide`);
    return pos;
  }

  /**
   * Toutes les positions.
   */
  getAllPositions(): readonly SquareWorldPosition[] {
    return this.squarePositions;
  }

  // ─── Plateau texture ───────────────────────────────────────────

  private buildTexturedBoard(): void {
    // Generer la texture dynamique
    const boardTexture = generateMonopolyBoardTexture(this.scene);

    // Plan horizontal pour le plateau
    this.boardBase = MeshBuilder.CreateBox('board-base', {
      width: BOARD_TOTAL + 0.05,
      height: BOARD_HEIGHT,
      depth: BOARD_TOTAL + 0.05,
    }, this.scene);
    this.boardBase.position.y = 0;

    // Materiau PBR avec la texture baked
    const mat = new PBRMaterial('board-mat', this.scene);
    mat.albedoTexture = boardTexture;
    mat.roughness = 0.85;
    mat.metallic = 0.02;

    // Orientation de la texture : la texture est generee avec
    // Depart en bas-droite. Le plan BJS a ses UV par defaut
    // qui correspondent bien si on ne tourne pas.
    // On doit retourner V car Canvas a Y vers le bas, BJS vers le haut.
    if (boardTexture) {
      boardTexture.vScale = -1;
      boardTexture.vOffset = 1;
    }

    // Legere reflexion ambiante
    mat.environmentIntensity = 0.3;
    mat.directIntensity = 1.0;

    this.boardBase.material = mat;
    this.boardBase.receiveShadows = true;
  }

  // ─── Cadre 3D en relief ────────────────────────────────────────

  private buildFrame(): void {
    const frameThickness = 0.25;
    const frameHeight = BOARD_HEIGHT + 0.08;
    const outerSize = BOARD_TOTAL + 0.5;

    const frameMat = new PBRMaterial('frame-mat', this.scene);
    frameMat.albedoColor = new Color3(0.25, 0.15, 0.08); // Bois fonce
    frameMat.roughness = 0.65;
    frameMat.metallic = 0.05;

    // 4 pieces du cadre
    const sides = [
      { name: 'frame-bottom', w: outerSize, d: frameThickness, x: 0, z: (outerSize - frameThickness) / 2 },
      { name: 'frame-top',    w: outerSize, d: frameThickness, x: 0, z: -(outerSize - frameThickness) / 2 },
      { name: 'frame-left',   w: frameThickness, d: outerSize, x: -(outerSize - frameThickness) / 2, z: 0 },
      { name: 'frame-right',  w: frameThickness, d: outerSize, x: (outerSize - frameThickness) / 2, z: 0 },
    ];

    for (const s of sides) {
      const piece = MeshBuilder.CreateBox(s.name, {
        width: s.w,
        height: frameHeight,
        depth: s.d,
      }, this.scene);
      piece.position = new Vector3(s.x, 0, s.z);
      piece.material = frameMat;
      piece.receiveShadows = true;
    }
  }

  // ─── Fallback procedural (version Phase 4) ────────────────────

  private buildFallbackBoard(): void {
    this.boardBase = MeshBuilder.CreateBox('board-base', {
      width: BOARD_TOTAL + 0.4,
      height: BOARD_HEIGHT,
      depth: BOARD_TOTAL + 0.4,
    }, this.scene);
    this.boardBase.position.y = -BOARD_HEIGHT / 2;

    const baseMat = new StandardMaterial('board-base-mat', this.scene);
    baseMat.diffuseColor = new Color3(0.85, 0.9, 0.82);
    baseMat.specularColor = new Color3(0.1, 0.1, 0.1);
    this.boardBase.material = baseMat;
    this.boardBase.receiveShadows = true;

    // Dessiner les cases individuellement (ancien comportement)
    this.buildFallbackSquares();
  }

  private buildFallbackSquares(): void {
    // On réutilise les positions calculées
    for (let i = 0; i < 40; i++) {
      const pos = this.squarePositions[i]!;
      const isCorner = i % 10 === 0;
      const size = isCorner ? CORNER_SIZE : CELL_WIDTH;
      const depth = isCorner ? CORNER_SIZE : CELL_DEPTH;

      const mesh = MeshBuilder.CreateBox(`square-${i}`, {
        width: size,
        height: 0.02,
        depth: depth,
      }, this.scene);

      mesh.position = new Vector3(pos.x, BOARD_HEIGHT / 2 + 0.01, pos.z);
      mesh.rotation.y = pos.rotation;

      const mat = new StandardMaterial(`square-mat-${i}`, this.scene);
      mat.diffuseColor = new Color3(0.95, 0.95, 0.92);
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      mesh.material = mat;
    }
  }

  // ─── Calcul des positions (identique a la version precedente) ──

  private computeSquarePositions(): void {
    const halfBoard = BOARD_TOTAL / 2;
    const startOffset = halfBoard - CORNER_SIZE / 2;

    for (let i = 0; i < 40; i++) {
      const side = Math.floor(i / 10);
      const indexOnSide = i % 10;

      let x: number;
      let z: number;
      let rotation: number;

      if (indexOnSide === 0) {
        switch (side) {
          case 0: x = startOffset; z = startOffset; rotation = 0; break;
          case 1: x = -startOffset; z = startOffset; rotation = Math.PI / 2; break;
          case 2: x = -startOffset; z = -startOffset; rotation = Math.PI; break;
          case 3: x = startOffset; z = -startOffset; rotation = -Math.PI / 2; break;
          default: x = 0; z = 0; rotation = 0;
        }
      } else {
        const t = CORNER_SIZE + (indexOnSide - 0.5) * CELL_WIDTH;

        switch (side) {
          case 0:
            x = startOffset - t;
            z = halfBoard - CELL_DEPTH / 2;
            rotation = 0;
            break;
          case 1:
            x = -(halfBoard - CELL_DEPTH / 2);
            z = startOffset - t;
            rotation = Math.PI / 2;
            break;
          case 2:
            x = -(startOffset - t);
            z = -(halfBoard - CELL_DEPTH / 2);
            rotation = Math.PI;
            break;
          case 3:
            x = halfBoard - CELL_DEPTH / 2;
            z = -(startOffset - t);
            rotation = -Math.PI / 2;
            break;
          default:
            x = 0; z = 0; rotation = 0;
        }
      }

      this.squarePositions.push({ x, z, rotation });
    }
  }
}
