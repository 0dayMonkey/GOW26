/**
 * BuildingManager — Presentation Layer
 *
 * Gere l affichage 3D des maisons et hotels.
 * Utilise InstancedMesh pour les performances.
 * [CERTAIN] API Babylon.js 7.x
 */

import {
  Scene,
  MeshBuilder,
  Mesh,
  InstancedMesh,
  Vector3,
  StandardMaterial,
  Color3,
  Animation,
  BackEase,
  EasingFunction,
} from '@babylonjs/core';
import { type EventBus } from '@infrastructure/event-bus';
import { type BoardMeshBuilder } from '../board/board-mesh-builder';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('BuildingManager');

const FRAME_RATE = 60;
const APPEAR_FRAMES = 24; // ~400ms pour maison
const HOTEL_APPEAR_FRAMES = 36; // ~600ms pour hotel

const HOUSE_SIZE = { width: 0.15, height: 0.18, depth: 0.12 };
const HOTEL_SIZE = { width: 0.25, height: 0.25, depth: 0.15 };
const BUILDING_Y = 0.2;

export class BuildingManager {
  private readonly scene: Scene;
  private readonly eventBus: EventBus;
  private readonly boardBuilder: BoardMeshBuilder;

  private houseTemplate: Mesh | null = null;
  private hotelTemplate: Mesh | null = null;
  private readonly instances: Map<string, InstancedMesh[]> = new Map(); // "squareIndex" → instances

  constructor(scene: Scene, eventBus: EventBus, boardBuilder: BoardMeshBuilder) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.boardBuilder = boardBuilder;
  }

  /**
   * Creer les templates de maison et hotel.
   */
  setup(): void {
    this.createHouseTemplate();
    this.createHotelTemplate();
    logger.info('Templates maison/hotel crees');
  }

  /**
   * Connecter au bus d evenements.
   */
  connectEvents(): void {
    this.eventBus.on('building:placed', (data) => {
      this.placeBuilding(data.squareIndex, data.buildingType, data.count);
    });
  }

  /**
   * Placer un batiment sur une case.
   */
  placeBuilding(squareIndex: number, type: 'house' | 'hotel', totalCount: number): void {
    const key = String(squareIndex);

    // Supprimer les anciens batiments sur cette case
    this.clearSquare(squareIndex);

    const pos = this.boardBuilder.getSquarePosition(squareIndex);

    if (type === 'hotel' || totalCount >= 5) {
      // Hotel unique
      const hotel = this.createHotelInstance(squareIndex, 0);
      hotel.position = new Vector3(pos.x, BUILDING_Y, pos.z);
      this.instances.set(key, [hotel]);
      this.animateAppear(hotel, HOTEL_APPEAR_FRAMES, true);
    } else {
      // Maisons (1 a 4)
      const houses: InstancedMesh[] = [];
      for (let i = 0; i < totalCount; i++) {
        const house = this.createHouseInstance(squareIndex, i);
        const offset = this.getHouseOffset(i, totalCount);
        house.position = new Vector3(
          pos.x + offset.x,
          BUILDING_Y,
          pos.z + offset.z,
        );
        houses.push(house);
        this.animateAppear(house, APPEAR_FRAMES, false);
      }
      this.instances.set(key, houses);
    }

    logger.info(`${type} place sur case ${squareIndex} (total: ${totalCount})`);
  }

  /**
   * Supprimer tous les batiments d une case.
   */
  clearSquare(squareIndex: number): void {
    const key = String(squareIndex);
    const existing = this.instances.get(key);
    if (existing) {
      for (const inst of existing) {
        inst.dispose();
      }
      this.instances.delete(key);
    }
  }

  // ─── Templates ─────────────────────────────────────────────────

  private createHouseTemplate(): void {
    this.houseTemplate = MeshBuilder.CreateBox('house-template', {
      width: HOUSE_SIZE.width,
      height: HOUSE_SIZE.height,
      depth: HOUSE_SIZE.depth,
    }, this.scene);

    const mat = new StandardMaterial('house-mat', this.scene);
    mat.diffuseColor = new Color3(0.18, 0.49, 0.2); // Vert #2E7D32
    mat.specularColor = new Color3(0.15, 0.15, 0.15);
    this.houseTemplate.material = mat;
    this.houseTemplate.isVisible = false; // Template cache
  }

  private createHotelTemplate(): void {
    this.hotelTemplate = MeshBuilder.CreateBox('hotel-template', {
      width: HOTEL_SIZE.width,
      height: HOTEL_SIZE.height,
      depth: HOTEL_SIZE.depth,
    }, this.scene);

    const mat = new StandardMaterial('hotel-mat', this.scene);
    mat.diffuseColor = new Color3(0.72, 0.11, 0.11); // Rouge #B71C1C
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    this.hotelTemplate.material = mat;
    this.hotelTemplate.isVisible = false;
  }

  // ─── Instances ─────────────────────────────────────────────────

  private createHouseInstance(squareIndex: number, houseIndex: number): InstancedMesh {
    if (!this.houseTemplate) throw new Error('House template non cree');
    const instance = this.houseTemplate.createInstance(`house-${squareIndex}-${houseIndex}`);
    return instance;
  }

  private createHotelInstance(squareIndex: number, _index: number): InstancedMesh {
    if (!this.hotelTemplate) throw new Error('Hotel template non cree');
    const instance = this.hotelTemplate.createInstance(`hotel-${squareIndex}`);
    return instance;
  }

  // ─── Animation ─────────────────────────────────────────────────

  private animateAppear(mesh: InstancedMesh, frames: number, isHotel: boolean): void {
    const ease = isHotel ? new BackEase(0.6) : new BackEase(0.4);
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);

    // Scale de 0 a 1
    const animScale = new Animation('buildAppear', 'scaling', FRAME_RATE,
      Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    animScale.setKeys([
      { frame: 0, value: new Vector3(0, 0, 0) },
      { frame: frames, value: new Vector3(1, 1, 1) },
    ]);
    animScale.setEasingFunction(ease);

    // Petit saut Y
    const animY = new Animation('buildY', 'position.y', FRAME_RATE,
      Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    const baseY = mesh.position.y;
    animY.setKeys([
      { frame: 0, value: baseY + 0.5 },
      { frame: frames * 0.6, value: baseY - 0.02 },
      { frame: frames, value: baseY },
    ]);

    mesh.animations = [animScale, animY];
    this.scene.beginAnimation(mesh, 0, frames, false);
  }

  /**
   * Decalage des maisons pour ne pas les superposer.
   */
  private getHouseOffset(index: number, total: number): { x: number; z: number } {
    const spacing = 0.18;
    const startX = -(total - 1) * spacing / 2;
    return { x: startX + index * spacing, z: 0 };
  }
}
