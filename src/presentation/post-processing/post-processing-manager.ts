/**
 * PostProcessingManager — Presentation Layer
 *
 * Pipeline de post-processing :
 * SSAO2 → Bloom → Tonemapping ACES → FXAA
 * [CERTAIN] API Babylon.js 7.x — DefaultRenderingPipeline, SSAO2RenderingPipeline
 */

import {
  Scene,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline,
  type Camera,
} from '@babylonjs/core';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('PostProcessing');

export class PostProcessingManager {
  private readonly scene: Scene;
  private pipeline: DefaultRenderingPipeline | null = null;
  private ssao: SSAO2RenderingPipeline | null = null;
  private enabled = true;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Configurer le pipeline complet.
   */
  setup(camera: Camera): void {
    this.setupDefaultPipeline(camera);
    this.setupSSAO(camera);
    logger.info('Post-processing configure (SSAO + Bloom + Tonemap + FXAA)');
  }

  /**
   * Activer/desactiver le post-processing.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.pipeline) {
      this.pipeline.bloomEnabled = enabled;
      this.pipeline.fxaaEnabled = enabled;
      this.pipeline.imageProcessingEnabled = enabled;
    }
    if (this.ssao) {
      // On ne peut pas disable directement la pipeline SSAO :
      // on met la force à 0 pour la désactiver visuellement.
      this.ssao.totalStrength = enabled ? 0.8 : 0;
    }
  }

  /**
   * Est-ce actif ?
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ─── Pipeline par defaut (Bloom + Tonemap + FXAA) ──────────────

  private setupDefaultPipeline(camera: Camera): void {
    this.pipeline = new DefaultRenderingPipeline(
      'default-pipeline',
      true, // HDR
      this.scene,
      [camera],
    );

    // Bloom
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.8;
    this.pipeline.bloomWeight = 0.3;
    this.pipeline.bloomKernel = 64;
    this.pipeline.bloomScale = 0.5;

    // Tonemapping
    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.imageProcessing.toneMappingEnabled = true;
    this.pipeline.imageProcessing.toneMappingType = 1; // ACES
    this.pipeline.imageProcessing.exposure = 1.0;
    this.pipeline.imageProcessing.contrast = 1.05;

    // FXAA
    this.pipeline.fxaaEnabled = true;

    // Vignette subtile
    this.pipeline.imageProcessing.vignetteEnabled = true;
    this.pipeline.imageProcessing.vignetteWeight = 1.5;
    this.pipeline.imageProcessing.vignetteStretch = 0;
    this.pipeline.imageProcessing.vignetteCameraFov = 0.5;
  }

  // ─── SSAO2 ─────────────────────────────────────────────────────

  private setupSSAO(camera: Camera): void {
    try {
      this.ssao = new SSAO2RenderingPipeline(
        'ssao-pipeline',
        this.scene,
        {
          ssaoRatio: 0.5,
          blurRatio: 0.5,
        },
      );

      this.ssao.radius = 0.5;
      this.ssao.totalStrength = 0.8;
      this.ssao.expensiveBlur = false;
      this.ssao.samples = 16;
      this.ssao.maxZ = 100;

      this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
        'ssao-pipeline',
        camera,
      );

      logger.info('SSAO2 configure');
    } catch (err: unknown) {
      logger.warn('SSAO2 non disponible, ignore', err);
    }
  }
}
