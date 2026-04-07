/**
 * LightingSetup — Presentation Layer
 *
 * Eclairage 3 points : DirectionalLight (sun), HemisphericLight (ambient),
 * PointLight (active square highlight).
 * Style "board game premium photographie en studio".
 * [CERTAIN] API Babylon.js 7.x
 */

import {
  Scene,
  DirectionalLight,
  HemisphericLight,
  PointLight,
  Vector3,
  Color3,
  ShadowGenerator,
} from '@babylonjs/core';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('LightingSetup');

export class LightingSetup {
  private readonly scene: Scene;
  private sunLight: DirectionalLight | null = null;
  private ambientLight: HemisphericLight | null = null;
  private activeSquareLight: PointLight | null = null;
  private shadowGenerator: ShadowGenerator | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Configurer l eclairage complet.
   */
  setup(): void {
    this.setupSunLight();
    this.setupAmbientLight();
    this.setupActiveSquareLight();
    logger.info('Eclairage 3 points configure');
  }

  /**
   * Lumiere directionnelle principale — soleil chaud a 35°.
   * Genere les ombres PCF Soft.
   */
  private setupSunLight(): void {
    // Direction : vient d en haut-gauche, angle ~35°
    const direction = new Vector3(-0.5, -0.85, -0.3).normalize();
    this.sunLight = new DirectionalLight('sun', direction, this.scene);
    this.sunLight.intensity = 1.2;
    this.sunLight.diffuse = new Color3(1.0, 0.95, 0.85); // Blanc chaud
    this.sunLight.specular = new Color3(1.0, 0.98, 0.9);

    // Position pour le calcul des ombres
    this.sunLight.position = new Vector3(5, 12, 5);

    // Shadow generator — PCF Soft
    this.shadowGenerator = new ShadowGenerator(1024, this.sunLight);
    this.shadowGenerator.usePercentageCloserFiltering = true;
    this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadowGenerator.bias = 0.001;
    this.shadowGenerator.normalBias = 0.02;

    logger.info('Sun light + shadow generator configures');
  }

  /**
   * Lumiere hemispherique — ambient fill doux.
   */
  private setupAmbientLight(): void {
    this.ambientLight = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    this.ambientLight.intensity = 0.3;
    this.ambientLight.diffuse = new Color3(0.9, 0.9, 1.0); // Leger bleu froid
    this.ambientLight.groundColor = new Color3(1.0, 0.63, 0.25); // #FFA040 — chaud sol
    this.ambientLight.specular = Color3.Black(); // Pas de specular sur l ambient
  }

  /**
   * PointLight pour highlight de la case active.
   * Eteinte par defaut, activee lors du tour.
   */
  private setupActiveSquareLight(): void {
    this.activeSquareLight = new PointLight('active-sq', new Vector3(0, 2, 0), this.scene);
    this.activeSquareLight.intensity = 0;
    this.activeSquareLight.diffuse = new Color3(1, 1, 1);
    this.activeSquareLight.range = 4;
  }

  /**
   * Activer le highlight sur une position du plateau.
   */
  highlightPosition(worldX: number, worldZ: number, color?: Color3): void {
    if (!this.activeSquareLight) return;
    this.activeSquareLight.position.x = worldX;
    this.activeSquareLight.position.z = worldZ;
    this.activeSquareLight.position.y = 2;
    this.activeSquareLight.intensity = 0.8;
    if (color) {
      this.activeSquareLight.diffuse = color;
    }
  }

  /**
   * Eteindre le highlight.
   */
  clearHighlight(): void {
    if (!this.activeSquareLight) {
      return;
    }
    this.activeSquareLight.intensity = 0;
  }

  /**
   * Acceder au ShadowGenerator pour y ajouter des meshes.
   */
  getShadowGenerator(): ShadowGenerator | null {
    return this.shadowGenerator;
  }

  /**
   * Acceder a la sun light.
   */
  getSunLight(): DirectionalLight | null {
    return this.sunLight;
  }
}
