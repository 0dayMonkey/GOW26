/**
 * Tests — Dice
 */

import { describe, it, expect } from 'vitest';
import { rollDice, createDiceRoll } from '../../src/game-logic/rules/dice';

describe('Dice', () => {
  describe('rollDice', () => {
    it('retourne des valeurs entre 1 et 6', () => {
      for (let i = 0; i < 100; i++) {
        const roll = rollDice();
        expect(roll.values[0]).toBeGreaterThanOrEqual(1);
        expect(roll.values[0]).toBeLessThanOrEqual(6);
        expect(roll.values[1]).toBeGreaterThanOrEqual(1);
        expect(roll.values[1]).toBeLessThanOrEqual(6);
      }
    });

    it('total est la somme des deux dés', () => {
      const roll = rollDice();
      expect(roll.total).toBe(roll.values[0] + roll.values[1]);
    });

    it('détecte les doubles', () => {
      const fakeRandom = (): number => 0.5; // → 4
      const roll = rollDice(fakeRandom);
      expect(roll.values[0]).toBe(4);
      expect(roll.values[1]).toBe(4);
      expect(roll.isDouble).toBe(true);
    });

    it('accepte un générateur custom', () => {
      let call = 0;
      const fakeRandom = (): number => {
        call++;
        return call === 1 ? 0.0 : 0.99; // dé 1 = 1, dé 2 = 6
      };
      const roll = rollDice(fakeRandom);
      expect(roll.values[0]).toBe(1);
      expect(roll.values[1]).toBe(6);
      expect(roll.total).toBe(7);
      expect(roll.isDouble).toBe(false);
    });
  });

  describe('createDiceRoll', () => {
    it('crée un roll à partir de valeurs fixes', () => {
      const roll = createDiceRoll(3, 5);
      expect(roll.values).toEqual([3, 5]);
      expect(roll.total).toBe(8);
      expect(roll.isDouble).toBe(false);
    });

    it('détecte un double', () => {
      const roll = createDiceRoll(6, 6);
      expect(roll.isDouble).toBe(true);
      expect(roll.total).toBe(12);
    });
  });
});
