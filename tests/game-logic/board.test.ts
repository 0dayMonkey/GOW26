/**
 * Tests — Board
 */

import { describe, it, expect } from 'vitest';
import { BOARD_SQUARES, getSquare } from '../../src/game-logic/board/board-definition';
import {
  getAllProperties,
  getPropertiesByColor,
  getGroupSize,
  nextPosition,
  passesGo,
  getSteps,
  nearestStation,
  isPurchasable,
} from '../../src/game-logic/board/board';
import { SquareType, ColorGroup } from '../../src/game-logic/types';

describe('Board', () => {
  describe('BOARD_SQUARES', () => {
    it('contient exactement 40 cases', () => {
      expect(BOARD_SQUARES).toHaveLength(40);
    });

    it('case 0 est Départ', () => {
      expect(getSquare(0).type).toBe(SquareType.GO);
    });

    it('case 10 est Prison', () => {
      expect(getSquare(10).type).toBe(SquareType.JAIL);
    });

    it('case 30 est Va en Prison', () => {
      expect(getSquare(30).type).toBe(SquareType.GO_TO_JAIL);
    });

    it('getSquare throw pour index invalide', () => {
      expect(() => getSquare(40)).toThrow();
      expect(() => getSquare(-1)).toThrow();
    });
  });

  describe('getAllProperties', () => {
    it('retourne 22 propriétés', () => {
      expect(getAllProperties()).toHaveLength(22);
    });
  });

  describe('getPropertiesByColor', () => {
    it('Violet a 2 propriétés', () => {
      expect(getPropertiesByColor(ColorGroup.VIOLET)).toHaveLength(2);
    });

    it('Orange a 3 propriétés', () => {
      expect(getPropertiesByColor(ColorGroup.ORANGE)).toHaveLength(3);
    });

    it('Bleu Foncé a 2 propriétés', () => {
      expect(getPropertiesByColor(ColorGroup.DARK_BLUE)).toHaveLength(2);
    });
  });

  describe('getGroupSize', () => {
    it('retourne la bonne taille pour chaque groupe', () => {
      expect(getGroupSize(ColorGroup.VIOLET)).toBe(2);
      expect(getGroupSize(ColorGroup.LIGHT_BLUE)).toBe(3);
      expect(getGroupSize(ColorGroup.DARK_BLUE)).toBe(2);
    });
  });

  describe('nextPosition', () => {
    it('avance normalement', () => {
      expect(nextPosition(5, 7)).toBe(12);
    });

    it('wrappe autour du plateau', () => {
      expect(nextPosition(38, 5)).toBe(3);
    });

    it('gère le recul', () => {
      expect(nextPosition(2, -3)).toBe(39);
    });
  });

  describe('passesGo', () => {
    it('détecte le passage par Départ', () => {
      expect(passesGo(35, 3)).toBe(true);
    });

    it('pas de passage si on ne wrappe pas', () => {
      expect(passesGo(5, 12)).toBe(false);
    });

    it('pas de passage si on atterrit sur Départ', () => {
      expect(passesGo(35, 0)).toBe(false);
    });
  });

  describe('getSteps', () => {
    it('retourne les cases traversées', () => {
      expect(getSteps(0, 3)).toEqual([1, 2, 3]);
    });

    it('wrappe correctement', () => {
      expect(getSteps(38, 4)).toEqual([39, 0, 1, 2]);
    });

    it('gère le recul', () => {
      expect(getSteps(2, -3)).toEqual([1, 0, 39]);
    });
  });

  describe('nearestStation', () => {
    it('depuis case 0 → gare Montparnasse (5)', () => {
      expect(nearestStation(0)).toBe(5);
    });

    it('depuis case 10 → gare de Lyon (15)', () => {
      expect(nearestStation(10)).toBe(15);
    });

    it('depuis case 36 → gare Montparnasse (5) (wrap)', () => {
      expect(nearestStation(36)).toBe(5);
    });
  });

  describe('isPurchasable', () => {
    it('propriété est achetable', () => {
      expect(isPurchasable(getSquare(1))).toBe(true);
    });

    it('gare est achetable', () => {
      expect(isPurchasable(getSquare(5))).toBe(true);
    });

    it('compagnie est achetable', () => {
      expect(isPurchasable(getSquare(12))).toBe(true);
    });

    it('Départ n\'est pas achetable', () => {
      expect(isPurchasable(getSquare(0))).toBe(false);
    });

    it('Chance n\'est pas achetable', () => {
      expect(isPurchasable(getSquare(7))).toBe(false);
    });
  });
});
