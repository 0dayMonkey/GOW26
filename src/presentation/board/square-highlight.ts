/**
 * SquareHighlight — Presentation Layer
 *
 * Effet visuel de highlight sur la case active (glow + surbrillance).
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
  SineEase,
} from '@babylonjs/core';
import { type SquareWorldPosition } from './board-mesh-builder';

const FRAME_RATE = 60;
const PULSE_FRAMES = 60; // 1 seconde de pulse

export class SquareHighlight {
  private readonly scene: Scene;
  private highlightMesh: Mesh | null = null;
  private highlightMat: StandardMaterial | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.createHighlightMesh();
  }

  /**
   * Afficher le highlight sur une case.
   */
  show(position: SquareWorldPosition, color?: Color3): void {
    if (!this.highlightMesh || !this.highlightMat) return;

    this.highlightMesh.position = new Vector3(position.x, 0.18, position.z);
    this.highlightMesh.rotation.y = position.rotation;
    this.highlightMesh.isVisible = true;
    this.highlightMat.diffuseColor = color ?? new Color3(1, 0.85, 0.2);
    this.highlightMat.emissiveColor = (color ?? new Color3(1, 0.85, 0.2)).scale(0.3);

    this.startPulse();
  }

  /**
   * Masquer le highlight.
   */
  hide(): void {
    if (!this.highlightMesh) return;
    this.highlightMesh.isVisible = false;
    this.scene.stopAnimation(this.highlightMesh);
  }

  // ─── Interne ───────────────────────────────────────────────────

  private createHighlightMesh(): void {
    this.highlightMesh = MeshBuilder.CreateBox('square-highlight', {
      width: 1.0,
      height: 0.005,
      depth: 1.0,
    }, this.scene);

    this.highlightMat = new StandardMaterial('highlight-mat', this.scene);
    this.highlightMat.diffuseColor = new Color3(1, 0.85, 0.2);
    this.highlightMat.emissiveColor = new Color3(0.3, 0.25, 0.06);
    this.highlightMat.alpha = 0.6;
    this.highlightMat.specularColor = Color3.Black();

    this.highlightMesh.material = this.highlightMat;
    this.highlightMesh.isVisible = false;
  }

  private startPulse(): void {
    if (!this.highlightMesh) return;

    const ease = new SineEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

    const alphaAnim = new Animation(
      'highlightPulse',
      'material.alpha',
      FRAME_RATE,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );

    alphaAnim.setKeys([
      { frame: 0, value: 0.4 },
      { frame: PULSE_FRAMES / 2, value: 0.7 },
      { frame: PULSE_FRAMES, value: 0.4 },
    ]);
    alphaAnim.setEasingFunction(ease);

    this.highlightMesh.animations = [alphaAnim];
    this.scene.beginAnimation(this.highlightMesh, 0, PULSE_FRAMES, true);
  }
}
