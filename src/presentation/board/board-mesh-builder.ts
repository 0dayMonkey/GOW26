/**
 * BoardMeshBuilder — Presentation Layer
 *
 * Construction procedurale du plateau Monopoly en 3D.
 * 40 cases disposees en carre, avec couleurs par groupe.
 * [CERTAIN] API Babylon.js 7.x — MeshBuilder, StandardMaterial
 */

import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  StandardMaterial,
  Color3,
  DynamicTexture,
} from '@babylonjs/core';
import { BOARD_SQUARES } from '@game-logic/board/board-definition';
import { SquareType, ColorGroup, type Square, type PropertySquare } from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('BoardMeshBuilder');

// ─── Dimensions ──────────────────────────────────────────────────────

const BOARD_TOTAL = 11;        // Taille totale du plateau (unites)
const CORNER_SIZE = 1.4;       // Taille des cases d angle
const SIDE_COUNT = 9;          // 9 cases par cote (hors coins)
const SIDE_LENGTH = BOARD_TOTAL - 2 * CORNER_SIZE; // longueur utile d un cote
const CELL_WIDTH = SIDE_LENGTH / SIDE_COUNT; // largeur d une case normale
const CELL_DEPTH = CORNER_SIZE; // profondeur d une case normale
const BOARD_HEIGHT = 0.15;     // epaisseur du plateau
const COLOR_STRIP_HEIGHT = 0.002; // surelévation du bandeau couleur

// ─── Couleurs des groupes ────────────────────────────────────────────

const GROUP_COLORS: Record<string, Color3> = {
  [ColorGroup.VIOLET]: new Color3(0.56, 0.27, 0.68),
  [ColorGroup.LIGHT_BLUE]: new Color3(0.68, 0.85, 0.9),
  [ColorGroup.PINK]: new Color3(0.85, 0.44, 0.58),
  [ColorGroup.ORANGE]: new Color3(0.93, 0.58, 0.15),
  [ColorGroup.RED]: new Color3(0.86, 0.2, 0.18),
  [ColorGroup.YELLOW]: new Color3(0.95, 0.9, 0.25),
  [ColorGroup.GREEN]: new Color3(0.18, 0.49, 0.2),
  [ColorGroup.DARK_BLUE]: new Color3(0.12, 0.14, 0.56),
};

const SPECIAL_COLORS: Record<string, Color3> = {
  [SquareType.GO]: new Color3(0.9, 0.15, 0.15),
  [SquareType.JAIL]: new Color3(0.95, 0.6, 0.2),
  [SquareType.FREE_PARKING]: new Color3(0.2, 0.7, 0.3),
  [SquareType.GO_TO_JAIL]: new Color3(0.15, 0.15, 0.6),
  [SquareType.CHANCE]: new Color3(0.95, 0.55, 0.1),
  [SquareType.COMMUNITY_CHEST]: new Color3(0.3, 0.6, 0.85),
  [SquareType.TAX]: new Color3(0.6, 0.6, 0.6),
  [SquareType.STATION]: new Color3(0.25, 0.25, 0.25),
  [SquareType.UTILITY]: new Color3(0.85, 0.85, 0.7),
};

// ─── Position d une case en coordonnees monde ───────────────────────

export interface SquareWorldPosition {
  x: number;
  z: number;
  rotation: number; // radians autour de Y
}

export class BoardMeshBuilder {
  private readonly scene: Scene;
  private readonly squarePositions: SquareWorldPosition[] = [];
  private boardBase: Mesh | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.computeSquarePositions();
  }

  /**
   * Construire tout le plateau.
   */
  build(): void {
    this.buildBase();
    this.buildSquares();
    logger.info('Plateau construit (40 cases)');
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

  // ─── Construction ──────────────────────────────────────────────

  private buildBase(): void {
    // Socle du plateau
    this.boardBase = MeshBuilder.CreateBox('board-base', {
      width: BOARD_TOTAL + 0.4,
      height: BOARD_HEIGHT,
      depth: BOARD_TOTAL + 0.4,
    }, this.scene);
    this.boardBase.position.y = -BOARD_HEIGHT / 2;

    const baseMat = new StandardMaterial('board-base-mat', this.scene);
    baseMat.diffuseColor = new Color3(0.85, 0.9, 0.82); // Vert plateau classique
    baseMat.specularColor = new Color3(0.1, 0.1, 0.1);
    baseMat.roughness = 0.85;
    this.boardBase.material = baseMat;
    this.boardBase.receiveShadows = true;
  }

  private buildSquares(): void {
    for (let i = 0; i < 40; i++) {
      const square = BOARD_SQUARES[i]!;
      const pos = this.squarePositions[i]!;
      const isCorner = i % 10 === 0;

      // Mesh de la case
      const size = isCorner ? CORNER_SIZE : CELL_WIDTH;
      const depth = isCorner ? CORNER_SIZE : CELL_DEPTH;

      const mesh = MeshBuilder.CreateBox(`square-${i}`, {
        width: size,
        height: 0.02,
        depth: depth,
      }, this.scene);

      mesh.position = new Vector3(pos.x, BOARD_HEIGHT / 2 + 0.01, pos.z);
      mesh.rotation.y = pos.rotation;

      // Materiau de la case
      const mat = new StandardMaterial(`square-mat-${i}`, this.scene);
      mat.diffuseColor = new Color3(0.95, 0.95, 0.92); // Blanc casse
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      mesh.material = mat;

      // Bandeau couleur pour les proprietes
      if (square.type === SquareType.PROPERTY) {
        this.buildColorStrip(i, square as PropertySquare, pos, size, depth);
      }

      // Icone/couleur pour cases speciales
      if (square.type !== SquareType.PROPERTY) {
        const specialColor = SPECIAL_COLORS[square.type];
        if (specialColor) {
          this.buildSpecialIndicator(i, pos, size, depth, specialColor);
        }
      }
    }
  }

  private buildColorStrip(
    index: number,
    square: PropertySquare,
    pos: SquareWorldPosition,
    width: number,
    depth: number,
  ): void {
    const color = GROUP_COLORS[square.color];
    if (!color) return;

    const strip = MeshBuilder.CreateBox(`color-strip-${index}`, {
      width: width * 0.95,
      height: 0.005,
      depth: depth * 0.25,
    }, this.scene);

    // Positionner le bandeau en haut de la case
    const offsetDepth = depth * 0.35;
    const dx = Math.sin(pos.rotation) * offsetDepth;
    const dz = Math.cos(pos.rotation) * offsetDepth;

    strip.position = new Vector3(
      pos.x - dx,
      BOARD_HEIGHT / 2 + 0.02 + COLOR_STRIP_HEIGHT,
      pos.z - dz,
    );
    strip.rotation.y = pos.rotation;

    const mat = new StandardMaterial(`color-mat-${index}`, this.scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    strip.material = mat;
  }

  private buildSpecialIndicator(
    index: number,
    pos: SquareWorldPosition,
    width: number,
    depth: number,
    color: Color3,
  ): void {
    const indicator = MeshBuilder.CreateBox(`special-${index}`, {
      width: width * 0.3,
      height: 0.005,
      depth: depth * 0.3,
    }, this.scene);

    indicator.position = new Vector3(pos.x, BOARD_HEIGHT / 2 + 0.02 + COLOR_STRIP_HEIGHT, pos.z);
    indicator.rotation.y = pos.rotation;

    const mat = new StandardMaterial(`special-mat-${index}`, this.scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    indicator.material = mat;
  }

  // ─── Calcul des positions ──────────────────────────────────────

  private computeSquarePositions(): void {
    const halfBoard = BOARD_TOTAL / 2;
    const startOffset = halfBoard - CORNER_SIZE / 2;

    for (let i = 0; i < 40; i++) {
      const side = Math.floor(i / 10); // 0=bas, 1=gauche, 2=haut, 3=droite
      const indexOnSide = i % 10;

      let x: number;
      let z: number;
      let rotation: number;

      if (indexOnSide === 0) {
        // Cases d angle
        switch (side) {
          case 0: x = startOffset; z = startOffset; rotation = 0; break;          // GO (bas-droite)
          case 1: x = -startOffset; z = startOffset; rotation = Math.PI / 2; break; // Prison (bas-gauche)
          case 2: x = -startOffset; z = -startOffset; rotation = Math.PI; break;   // Parc Gratuit (haut-gauche)
          case 3: x = startOffset; z = -startOffset; rotation = -Math.PI / 2; break; // Va en Prison (haut-droite)
          default: x = 0; z = 0; rotation = 0;
        }
      } else {
        // Cases normales — position le long du cote
        const t = CORNER_SIZE + (indexOnSide - 0.5) * CELL_WIDTH;

        switch (side) {
          case 0: // Bas : droite vers gauche, z = +startOffset
            x = startOffset - t;
            z = halfBoard - CELL_DEPTH / 2;
            rotation = 0;
            break;
          case 1: // Gauche : bas vers haut, x = -startOffset
            x = -(halfBoard - CELL_DEPTH / 2);
            z = startOffset - t;
            rotation = Math.PI / 2;
            break;
          case 2: // Haut : gauche vers droite, z = -startOffset
            x = -(startOffset - t);
            z = -(halfBoard - CELL_DEPTH / 2);
            rotation = Math.PI;
            break;
          case 3: // Droite : haut vers bas, x = +startOffset
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
