/**
 * AssetLoader — Infrastructure Layer
 *
 * Charge les assets 3D (.glb) et textures.
 * Fallback procedural si asset absent.
 * Met a jour le splash screen pendant le chargement.
 * [CERTAIN] API Babylon.js 7.x — AssetsManager
 */

import { Scene } from '@babylonjs/core';
import { Logger } from './logger';

const logger = Logger.create('AssetLoader');

export interface LoadingCallbacks {
  onProgress?: (progress: number, status: string) => void;
  onComplete?: () => void;
}

export class AssetLoader {
  // La scène sera nécessaire dès qu'on chargera des .glb (Phase 5+).
  constructor(_scene: Scene) {
    // Placeholder — actuellement pas utilisé (tout est procedural).
  }

  /**
   * Charger tous les assets necessaires.
   * Pour l instant (Phase 4), tout est procedural — ce loader
   * sera utilise en Phase 5+ pour les .glb de pions/des/batiments.
   */
  async loadAll(callbacks?: LoadingCallbacks): Promise<void> {
    const steps = [
      { progress: 20, status: 'Preparation de la scene...' },
      { progress: 50, status: 'Construction du plateau...' },
      { progress: 80, status: 'Configuration des lumieres...' },
      { progress: 100, status: 'Pret !' },
    ];

    for (const step of steps) {
      callbacks?.onProgress?.(step.progress, step.status);
      // Petit delai pour laisser le DOM se mettre a jour
      await this.delay(100);
    }

    callbacks?.onComplete?.();
    logger.info('Assets charges (mode procedural)');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
