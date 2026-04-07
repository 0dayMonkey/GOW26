/**
 * Tests — Rent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { calculateRent } from '../../src/game-logic/rules/rent';
import { createGameState } from '../../src/game-logic/state/game-state';
import { createHumanPlayer, createAIPlayer, resetPlayerIdCounter } from '../../src/game-logic/player/player-factory';
import { createDiceRoll } from '../../src/game-logic/rules/dice';
import { type GameState, type OwnedProperty, type Player } from '../../src/game-logic/types';

describe('Rent', () => {
  let p1: Player;
  let p2: Player;
  let state: GameState;

  beforeEach(() => {
    resetPlayerIdCounter();
    p1 = createHumanPlayer('Alice', 0);
    p2 = createAIPlayer('Bot', 1);
    state = createGameState([p1, p2]);
  });

  describe('propriété non possédée', () => {
    it('retourne 0', () => {
      const rent = calculateRent(1, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(0);
    });
  });

  describe('propriété possédée par le joueur qui atterrit', () => {
    it('retourne 0', () => {
      (state.properties as OwnedProperty[]).push({ squareIndex: 1, ownerId: p1.id, houses: 0 });
      const rent = calculateRent(1, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(0);
    });
  });

  describe('propriété nue (pas de monopole)', () => {
    it('retourne le loyer de base', () => {
      // Bd Méditerranée (case 1) : loyer nu = 2€
      (state.properties as OwnedProperty[]).push({ squareIndex: 1, ownerId: p2.id, houses: 0 });
      const rent = calculateRent(1, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(2);
    });
  });

  describe('propriété avec monopole (pas de maisons)', () => {
    it('retourne le loyer doublé', () => {
      // Violet = cases 1 et 3, loyer nu case 1 = 2€ → monopole = 4€
      (state.properties as OwnedProperty[]).push({ squareIndex: 1, ownerId: p2.id, houses: 0 });
      (state.properties as OwnedProperty[]).push({ squareIndex: 3, ownerId: p2.id, houses: 0 });
      const rent = calculateRent(1, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(4);
    });
  });

  describe('propriété avec maisons', () => {
    it('1 maison → loyer correspondant', () => {
      // Bd Méditerranée (case 1) : 1 maison = 10€
      (state.properties as OwnedProperty[]).push({ squareIndex: 1, ownerId: p2.id, houses: 1 });
      (state.properties as OwnedProperty[]).push({ squareIndex: 3, ownerId: p2.id, houses: 0 });
      const rent = calculateRent(1, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(10);
    });

    it('hôtel (5) → loyer max', () => {
      // Bd Méditerranée (case 1) : hôtel = 250€
      (state.properties as OwnedProperty[]).push({ squareIndex: 1, ownerId: p2.id, houses: 5 });
      (state.properties as OwnedProperty[]).push({ squareIndex: 3, ownerId: p2.id, houses: 0 });
      const rent = calculateRent(1, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(250);
    });
  });

  describe('gares', () => {
    it('1 gare = 25€', () => {
      (state.properties as OwnedProperty[]).push({ squareIndex: 5, ownerId: p2.id, houses: 0 });
      const rent = calculateRent(5, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(25);
    });

    it('2 gares = 50€', () => {
      (state.properties as OwnedProperty[]).push({ squareIndex: 5, ownerId: p2.id, houses: 0 });
      (state.properties as OwnedProperty[]).push({ squareIndex: 15, ownerId: p2.id, houses: 0 });
      const rent = calculateRent(5, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(50);
    });

    it('4 gares = 200€', () => {
      (state.properties as OwnedProperty[]).push({ squareIndex: 5, ownerId: p2.id, houses: 0 });
      (state.properties as OwnedProperty[]).push({ squareIndex: 15, ownerId: p2.id, houses: 0 });
      (state.properties as OwnedProperty[]).push({ squareIndex: 25, ownerId: p2.id, houses: 0 });
      (state.properties as OwnedProperty[]).push({ squareIndex: 35, ownerId: p2.id, houses: 0 });
      const rent = calculateRent(5, p1.id, state, createDiceRoll(3, 4));
      expect(rent).toBe(200);
    });
  });

  describe('compagnies', () => {
    it('1 compagnie = 4× le dé', () => {
      (state.properties as OwnedProperty[]).push({ squareIndex: 12, ownerId: p2.id, houses: 0 });
      const dice = createDiceRoll(3, 4); // total = 7
      const rent = calculateRent(12, p1.id, state, dice);
      expect(rent).toBe(28); // 7 × 4
    });

    it('2 compagnies = 10× le dé', () => {
      (state.properties as OwnedProperty[]).push({ squareIndex: 12, ownerId: p2.id, houses: 0 });
      (state.properties as OwnedProperty[]).push({ squareIndex: 28, ownerId: p2.id, houses: 0 });
      const dice = createDiceRoll(5, 3); // total = 8
      const rent = calculateRent(12, p1.id, state, dice);
      expect(rent).toBe(80); // 8 × 10
    });
  });
});
