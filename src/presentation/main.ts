/**
 * Point d'entrée — Presentation Layer
 *
 * Ce fichier bootstrap Babylon.js et affiche une scène minimale
 * pour valider le setup Phase 0. Il sera remplacé par le vrai
 * SceneManager en Phase 4.
 */

import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from '@babylonjs/core';

function updateSplash(progress: number, status: string): void {
  const fill = document.getElementById('progressFill') as HTMLElement | null;
  const statusEl = document.getElementById('splashStatus') as HTMLElement | null;
  if (fill) fill.style.width = `${progress}%`;
  if (statusEl) statusEl.textContent = status;
}

function hideSplash(): void {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 600);
  }
}

async function main(): Promise<void> {
  updateSplash(10, 'Création du moteur…');

  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas #renderCanvas introuvable');

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
  });

  updateSplash(30, 'Création de la scène…');

  const scene = new Scene(engine);
  scene.clearColor.set(0.1, 0.1, 0.12, 1);

  // Caméra orbitale — sera remplacée par CameraController
  const camera = new ArcRotateCamera('camera', -Math.PI / 4, Math.PI / 3, 18, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 30;
  camera.wheelDeltaPercentage = 0.01;

  updateSplash(50, 'Éclairage…');

  // Éclairage basique — sera remplacé par LightingSetup
  const light = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  light.intensity = 0.8;

  updateSplash(70, 'Plateau placeholder…');

  // Placeholder : un box vert représentant le futur plateau
  const _ground = MeshBuilder.CreateBox(
    'board-placeholder',
    { width: 11, height: 0.3, depth: 11 },
    scene,
  );
  _ground.position.y = -0.15;

  updateSplash(100, 'Prêt !');
  hideSplash();

  // Render loop
  engine.runRenderLoop(() => {
    scene.render();
  });

  // Resize
  window.addEventListener('resize', () => {
    engine.resize();
  });
}

main().catch((err: unknown) => {
  console.error('[FATAL] Échec initialisation:', err);
});
