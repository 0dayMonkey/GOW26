/**
 * PawnFactory — Presentation Layer
 *
 * Cree les 4 pions 3D proceduralement (fallback sans .glb).
 * Chaque pion a une forme et couleur distincte.
 * [CERTAIN] API Babylon.js 7.x
 */

import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('PawnFactory');

// Couleurs des joueurs
const PAWN_COLORS: Color3[] = [
  new Color3(0.85, 0.15, 0.15), // Rouge — joueur humain
  new Color3(0.15, 0.4, 0.85),  // Bleu — IA 1
  new Color3(0.15, 0.7, 0.25),  // Vert — IA 2
  new Color3(0.9, 0.75, 0.1),   // Jaune — IA 3
];

const PAWN_NAMES = ['Chapeau', 'Fer', 'Voiture', 'De'];

export interface PawnMesh {
  readonly mesh: Mesh;
  readonly playerId: string;
  readonly pawnIndex: number;
}

export class PawnFactory {
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Creer un pion pour un joueur.
   * Forme procedurale differente selon le pawnIndex.
   */
  createPawn(playerId: string, pawnIndex: number): PawnMesh {
    let mesh: Mesh;

    switch (pawnIndex) {
      case 0:
        mesh = this.createHat(playerId);
        break;
      case 1:
        mesh = this.createIron(playerId);
        break;
      case 2:
        mesh = this.createCar(playerId);
        break;
      case 3:
        mesh = this.createDie(playerId);
        break;
      default:
        mesh = this.createHat(playerId);
    }

    // Materiau PBR metallique
    const mat = new StandardMaterial(`pawn-mat-${playerId}`, this.scene);
    const color = PAWN_COLORS[pawnIndex] ?? PAWN_COLORS[0]!;
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.6, 0.6, 0.6);
    mat.specularPower = 64;
    mesh.material = mat;

    // Taille et position initiale
    mesh.scaling = new Vector3(0.4, 0.4, 0.4);
    mesh.position.y = 0.3;

    logger.info(`Pion cree: ${PAWN_NAMES[pawnIndex]} pour ${playerId}`);

    return { mesh, playerId, pawnIndex };
  }

  // ─── Formes procedurales ───────────────────────────────────────

  /**
   * Chapeau haut-de-forme : cylindre + disque large en bas
   */
  private createHat(id: string): Mesh {
    const body = MeshBuilder.CreateCylinder(`pawn-hat-body-${id}`, {
      height: 1.2,
      diameterTop: 0.5,
      diameterBottom: 0.55,
      tessellation: 16,
    }, this.scene);

    const brim = MeshBuilder.CreateCylinder(`pawn-hat-brim-${id}`, {
      height: 0.08,
      diameter: 1.1,
      tessellation: 16,
    }, this.scene);
    brim.position.y = -0.55;
    brim.parent = body;

    body.name = `pawn-${id}`;
    return body;
  }

  /**
   * Fer a repasser : box aplatie avec pointe
   */
  private createIron(id: string): Mesh {
    const body = MeshBuilder.CreateBox(`pawn-iron-${id}`, {
      width: 0.8,
      height: 0.5,
      depth: 0.5,
    }, this.scene);

    const handle = MeshBuilder.CreateCylinder(`pawn-iron-handle-${id}`, {
      height: 0.6,
      diameter: 0.12,
      tessellation: 8,
    }, this.scene);
    handle.position.y = 0.45;
    handle.rotation.z = Math.PI / 6;
    handle.parent = body;

    body.name = `pawn-${id}`;
    return body;
  }

  /**
   * Voiture : box allongee + roues
   */
  private createCar(id: string): Mesh {
    const body = MeshBuilder.CreateBox(`pawn-car-${id}`, {
      width: 0.5,
      height: 0.35,
      depth: 1.0,
    }, this.scene);

    // Toit
    const roof = MeshBuilder.CreateBox(`pawn-car-roof-${id}`, {
      width: 0.45,
      height: 0.25,
      depth: 0.5,
    }, this.scene);
    roof.position.y = 0.28;
    roof.position.z = -0.1;
    roof.parent = body;

    body.name = `pawn-${id}`;
    return body;
  }

  /**
   * De : cube avec coins arrondis (simule)
   */
  private createDie(id: string): Mesh {
    const die = MeshBuilder.CreateBox(`pawn-die-${id}`, {
      size: 0.65,
    }, this.scene);

    // Legere rotation pour un look dynamique
    die.rotation.y = Math.PI / 8;
    die.rotation.x = Math.PI / 12;

    die.name = `pawn-${id}`;
    return die;
  }
}
