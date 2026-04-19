/**
 * Tests — Building
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { canBuild, buildHouse, countPlayerHouses, countPlayerHotels } from '../../src/game-logic/rules/building';
import { createGameState } from '../../src/game-logic/state/game-state';
import { createHumanPlayer, createAIPlayer, resetPlayerIdCounter } from '../../src/game-logic/player/player-factory';
import { type GameState, type OwnedProperty, type Player } from '../../src/game-logic/types';
import { STARTING_BALANCE } from '../../src/game-logic/constants';

describe('Building', () => {
  let p1: Player;
  let p2: Player;
  let state: GameState;

  beforeEach(() => {
    resetPlayerIdCounter();
    p1 = createHumanPlayer('Alice', 0);
    p2 = createAIPlayer('Bot', 1);
    state = createGameState([p1, p2]);
  });

  function giveMonopoly(playerId: string, squareIndices: number[]): void {
    for (const idx of squareIndices) {
      (state.properties as OwnedProperty[]).push({ squareIndex: idx, ownerId: playerId, houses: 0 });
    }
  }

  describe('canBuild', () => {
    it('réussit avec monopole et fonds suffisants', () => {
      giveMonopoly(p1.id, [1, 3]); // Violet
      const result = canBuild(1, p1.id, state);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cost).toBe(50); // houseCost Violet
        expect(result.data.newLevel).toBe(1);
      }
    });

    it('échoue sans monopole', () => {
      (state.properties as OwnedProperty[]).push({ squareIndex: 1, ownerId: p1.id, houses: 0 });
      const result = canBuild(1, p1.id, state);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NO_MONOPOLY');
    });

    it('échoue si pas propriétaire', () => {
      giveMonopoly(p2.id, [1, 3]);
      const result = canBuild(1, p1.id, state);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_OWNED');
    });

    it('échoue si déjà un hôtel', () => {
      giveMonopoly(p1.id, [1, 3]);
      const owned = state.properties.find((p) => p.squareIndex === 1)!;
      (owned as OwnedProperty).houses = 5;
      const result = canBuild(1, p1.id, state);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('MAX_BUILDINGS');
    });

    it('échoue si fonds insuffisants', () => {
      giveMonopoly(p1.id, [1, 3]);
      p1.balance = 10;
      const result = canBuild(1, p1.id, state);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('échoue sur une case non-propriété', () => {
      const result = canBuild(0, p1.id, state); // Départ
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_PROPERTY');
    });
  });

  describe('buildHouse', () => {
    it('construit et déduit le coût', () => {
      giveMonopoly(p1.id, [1, 3]);
      const result = buildHouse(1, p1.id, state);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newLevel).toBe(1);
        expect(result.data.cost).toBe(50);
      }
      expect(p1.balance).toBe(STARTING_BALANCE - 50);

      const owned = state.properties.find((p) => p.squareIndex === 1)!;
      expect(owned.houses).toBe(1);
    });

    it('construit jusqu\'à l\'hôtel (construction équitable)', () => {
      giveMonopoly(p1.id, [1, 3]);
      // Règle officielle : construction uniforme dans le groupe.
      // On alterne entre les 2 propriétés pour rester équitable.
      // 1 maison sur chaque (4 builds : 1,3,1,3 → [2,2])
      // Puis 3 sur chaque (4 builds : 1,3,1,3 → [4,4])
      // Puis hôtel sur chaque (2 builds : 1,3 → [5,5])
      for (let i = 0; i < 5; i++) {
        expect(buildHouse(1, p1.id, state).success).toBe(true);
        expect(buildHouse(3, p1.id, state).success).toBe(true);
      }
      const o1 = state.properties.find((p) => p.squareIndex === 1)!;
      const o3 = state.properties.find((p) => p.squareIndex === 3)!;
      expect(o1.houses).toBe(5); // hôtel
      expect(o3.houses).toBe(5); // hôtel

      // Nouvelle construction échoue (déjà hôtel)
      const result = buildHouse(1, p1.id, state);
      expect(result.success).toBe(false);
    });

    it('refuse une construction non équitable', () => {
      giveMonopoly(p1.id, [1, 3]);
      // Première maison sur 1 — OK (ex-æquo)
      expect(buildHouse(1, p1.id, state).success).toBe(true);
      // Deuxième sur 1 alors que 3 est à 0 — INTERDIT
      const result = buildHouse(1, p1.id, state);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('BUILD_UNEVEN');
    });
  });

  describe('countPlayerHouses / countPlayerHotels', () => {
    it('compte les maisons (hors hôtels)', () => {
      const props: OwnedProperty[] = [
        { squareIndex: 1, ownerId: p1.id, houses: 3 },
        { squareIndex: 3, ownerId: p1.id, houses: 2 },
        { squareIndex: 6, ownerId: p1.id, houses: 5 }, // hôtel → pas compté
      ];
      expect(countPlayerHouses(p1.id, props)).toBe(5); // 3 + 2
    });

    it('compte les hôtels', () => {
      const props: OwnedProperty[] = [
        { squareIndex: 1, ownerId: p1.id, houses: 5 },
        { squareIndex: 3, ownerId: p1.id, houses: 5 },
        { squareIndex: 6, ownerId: p1.id, houses: 3 },
      ];
      expect(countPlayerHotels(p1.id, props)).toBe(2);
    });

    it('ne compte pas les propriétés des autres joueurs', () => {
      const props: OwnedProperty[] = [
        { squareIndex: 1, ownerId: p1.id, houses: 2 },
        { squareIndex: 3, ownerId: p2.id, houses: 3 },
      ];
      expect(countPlayerHouses(p1.id, props)).toBe(2);
      expect(countPlayerHouses(p2.id, props)).toBe(3);
    });
  });
});
