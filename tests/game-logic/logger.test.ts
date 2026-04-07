/**
 * Tests — Logger
 *
 * Couverture : niveaux, filtrage, enable/disable,
 * sortie custom, préfixes, fail-safe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../../src/infrastructure/logger';

describe('Logger', () => {
  let captured: Array<{ level: LogLevel; prefix: string; message: string; data?: unknown }>;

  beforeEach(() => {
    captured = [];
    Logger.setLevel(LogLevel.DEBUG);
    Logger.setEnabled(true);
    Logger.setOutput((entry) => {
      captured.push({
        level: entry.level,
        prefix: entry.prefix,
        message: entry.message,
        data: entry.data,
      });
    });
  });

  afterEach(() => {
    Logger.resetOutput();
    Logger.setLevel(LogLevel.DEBUG);
    Logger.setEnabled(true);
  });

  // ─── Création ────────────────────────────────────────────────────

  describe('create', () => {
    it('crée un logger avec le bon préfixe', () => {
      const logger = Logger.create('GameLogic');
      logger.info('test');

      expect(captured).toHaveLength(1);
      expect(captured[0]!.prefix).toBe('GameLogic');
    });
  });

  // ─── Niveaux ─────────────────────────────────────────────────────

  describe('niveaux', () => {
    it('debug émet au niveau DEBUG', () => {
      const logger = Logger.create('Test');
      logger.debug('msg');

      expect(captured[0]!.level).toBe(LogLevel.DEBUG);
    });

    it('info émet au niveau INFO', () => {
      const logger = Logger.create('Test');
      logger.info('msg');

      expect(captured[0]!.level).toBe(LogLevel.INFO);
    });

    it('warn émet au niveau WARN', () => {
      const logger = Logger.create('Test');
      logger.warn('msg');

      expect(captured[0]!.level).toBe(LogLevel.WARN);
    });

    it('error émet au niveau ERROR', () => {
      const logger = Logger.create('Test');
      logger.error('msg');

      expect(captured[0]!.level).toBe(LogLevel.ERROR);
    });
  });

  // ─── Filtrage par niveau ─────────────────────────────────────────

  describe('filtrage par niveau', () => {
    it('filtre les niveaux inférieurs au seuil', () => {
      Logger.setLevel(LogLevel.WARN);
      const logger = Logger.create('Test');

      logger.debug('hidden');
      logger.info('hidden');
      logger.warn('visible');
      logger.error('visible');

      expect(captured).toHaveLength(2);
      expect(captured[0]!.message).toBe('visible');
      expect(captured[1]!.message).toBe('visible');
    });

    it('SILENT bloque tout', () => {
      Logger.setLevel(LogLevel.SILENT);
      const logger = Logger.create('Test');

      logger.debug('nope');
      logger.info('nope');
      logger.warn('nope');
      logger.error('nope');

      expect(captured).toHaveLength(0);
    });
  });

  // ─── Enabled / Disabled ──────────────────────────────────────────

  describe('enabled', () => {
    it('setEnabled(false) bloque tous les logs', () => {
      Logger.setEnabled(false);
      const logger = Logger.create('Test');

      logger.error('hidden');

      expect(captured).toHaveLength(0);
    });

    it('setEnabled(true) réactive les logs', () => {
      Logger.setEnabled(false);
      Logger.setEnabled(true);
      const logger = Logger.create('Test');

      logger.info('visible');

      expect(captured).toHaveLength(1);
    });
  });

  // ─── Data ────────────────────────────────────────────────────────

  describe('data', () => {
    it('transmet les données additionnelles', () => {
      const logger = Logger.create('Test');
      logger.info('avec data', { balance: 1500 });

      expect(captured[0]!.data).toEqual({ balance: 1500 });
    });

    it('data est undefined si non fournie', () => {
      const logger = Logger.create('Test');
      logger.info('sans data');

      expect(captured[0]!.data).toBeUndefined();
    });
  });

  // ─── Fail-safe ───────────────────────────────────────────────────

  describe('fail-safe', () => {
    it('ne crashe pas si l'output throw', () => {
      Logger.setOutput(() => {
        throw new Error('output broken');
      });
      const logger = Logger.create('Test');

      expect(() => logger.error('test')).not.toThrow();
    });
  });

  // ─── getLevel ────────────────────────────────────────────────────

  describe('getLevel', () => {
    it('retourne le niveau actuel', () => {
      Logger.setLevel(LogLevel.WARN);
      expect(Logger.getLevel()).toBe(LogLevel.WARN);
    });
  });
});
