/**
 * AudioManager — Presentation Layer
 *
 * Sons proceduraux via Web Audio API (pas de fichiers .ogg necessaires).
 * Sons pour : lancer de des, deplacement pion, achat, loyer, prison, victoire.
 * [CERTAIN] Web Audio API standard
 */

import { type EventBus } from '@infrastructure/event-bus';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('AudioManager');

export class AudioManager {
  private readonly eventBus: EventBus;
  private ctx: AudioContext | null = null;
  private enabled = true;
  private initialized = false;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Initialiser le contexte audio (doit etre appele apres une interaction utilisateur).
   */
  setup(): void {
    // Le contexte sera cree au premier son (interaction utilisateur requise)
    logger.info('AudioManager pret (contexte differe)');
  }

  /**
   * Connecter les evenements.
   */
  connectEvents(): void {
    this.eventBus.on('dice:rolled', () => this.playDiceRoll());
    this.eventBus.on('pawn:moved', () => this.playPawnStep());
    this.eventBus.on('property:bought', () => this.playBuy());
    this.eventBus.on('rent:paid', () => this.playRent());
    this.eventBus.on('player:jailed', () => this.playJail());
    this.eventBus.on('player:released', () => this.playRelease());
    this.eventBus.on('card:drawn', () => this.playCard());
    this.eventBus.on('building:placed', () => this.playBuild());
    this.eventBus.on('player:bankrupt', () => this.playBankrupt());
    this.eventBus.on('game:ended', () => this.playVictory());
    this.eventBus.on('turn:started', () => this.playTurnStart());
  }

  /**
   * Activer/desactiver le son.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isAudioEnabled(): boolean {
    return this.enabled;
  }

  // ─── Sons proceduraux ──────────────────────────────────────────

  private playDiceRoll(): void {
    this.playNoise(0.12, 0.3, 800, 2000);
  }

  private playPawnStep(): void {
    this.playTone(440, 0.04, 'sine', 0.15);
  }

  private playBuy(): void {
    // Accord joyeux montant
    this.playTone(523, 0.1, 'sine', 0.2);
    setTimeout(() => this.playTone(659, 0.1, 'sine', 0.2), 80);
    setTimeout(() => this.playTone(784, 0.15, 'sine', 0.2), 160);
  }

  private playRent(): void {
    // Son descendant (perte)
    this.playTone(400, 0.1, 'sawtooth', 0.1);
    setTimeout(() => this.playTone(300, 0.15, 'sawtooth', 0.1), 100);
  }

  private playJail(): void {
    // Son grave menaçant
    this.playTone(150, 0.3, 'square', 0.12);
    setTimeout(() => this.playTone(120, 0.3, 'square', 0.1), 200);
  }

  private playRelease(): void {
    // Accord montant liberateur
    this.playTone(330, 0.08, 'sine', 0.15);
    setTimeout(() => this.playTone(440, 0.08, 'sine', 0.15), 100);
    setTimeout(() => this.playTone(660, 0.12, 'sine', 0.15), 200);
  }

  private playCard(): void {
    // Bruit de carte
    this.playNoise(0.05, 0.08, 2000, 6000);
    setTimeout(() => this.playTone(600, 0.06, 'sine', 0.12), 50);
  }

  private playBuild(): void {
    // Marteau
    this.playTone(200, 0.03, 'square', 0.2);
    setTimeout(() => this.playTone(250, 0.05, 'square', 0.15), 80);
  }

  private playBankrupt(): void {
    // Descente tragique
    this.playTone(300, 0.2, 'sawtooth', 0.12);
    setTimeout(() => this.playTone(200, 0.2, 'sawtooth', 0.1), 200);
    setTimeout(() => this.playTone(100, 0.4, 'sawtooth', 0.08), 400);
  }

  private playVictory(): void {
    // Fanfare
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.2, 'sine', 0.2), i * 150);
    });
    setTimeout(() => {
      this.playTone(1047, 0.5, 'sine', 0.25);
      this.playTone(784, 0.5, 'sine', 0.15);
      this.playTone(523, 0.5, 'sine', 0.1);
    }, 700);
  }

  private playTurnStart(): void {
    this.playTone(880, 0.03, 'sine', 0.08);
  }

  // ─── Generateurs de base ───────────────────────────────────────

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.initialized = true;
        logger.info('AudioContext cree');
      } catch {
        logger.warn('Web Audio API non disponible');
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration + 0.05);
    } catch {
      // Silently fail
    }
  }

  private playNoise(
    duration: number,
    volume: number,
    lowFreq: number,
    highFreq: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = (lowFreq + highFreq) / 2;
      bandpass.Q.value = 1;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      source.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(ctx.destination);

      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + duration + 0.05);
    } catch {
      // Silently fail
    }
  }
}
