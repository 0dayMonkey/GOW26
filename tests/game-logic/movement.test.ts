/**
 * Tests — Movement
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { movePlayer, movePlayerTo, movePlayerBack } from '../../src/game-logic/rules/movement';
import { createHumanPlayer, resetPlayerIdCounter } from '../../src/game-logic/player/player-factory';
import { createDiceRoll } from '../../src/game-logic/rules/dice';
import { type Player } from '../../src/game-logic/types';
import { STARTING_BALANCE } from '../../src/game-logic/constants';

describe('Movement', () => {
  let player: Player;

  beforeEach(() => {
    resetPlayerIdCounter();
    player = createHumanPlayer('Alice', 0);
  });

  describe('movePlayer', () => {
    it('déplace le joueur à la bonne position', () => {
      player.position = 5;
      const result = movePlayer(player, createDiceRoll(3, 4)); // total = 7
      expect(player.position).toBe(12);
      expect(result.from).toBe(5);
      expect(result.to).toBe(12);
    });

    it('wrappe autour du plateau', () => {
      player.position = 38;
      const result = movePlayer(player, createDiceRoll(3, 2)); // total = 5
      expect(player.position).toBe(3);
      expect(result.passedGo).toBe(true);
    });

    it('donne 200€ au passage par Départ', () => {
      player.position = 38;
      movePlayer(player, createDiceRoll(3, 2)); // passe par 0
      expect(player.balance).toBe(STARTING_BALANCE + 200);
    });

    it('donne 200€ en atterrissant sur Départ', () => {
      player.position = 35;
      movePlayer(player, createDiceRoll(3, 2)); // atterrit sur 0
      expect(player.balance).toBe(STARTING_BALANCE + 200);
    });

    it('ne donne pas 200€ sans passage par Départ', () => {
      player.position = 5;
      movePlayer(player, createDiceRoll(3, 4));
      expect(player.balance).toBe(STARTING_BALANCE);
    });

    it('envoie en prison sur case 30', () => {
      player.position = 25;
      const result = movePlayer(player, createDiceRoll(3, 2)); // total = 5 → case 30
      expect(result.landedOnGoToJail).toBe(true);
      expect(player.inJail).toBe(true);
      expect(player.position).toBe(10); // prison
    });

    it('retourne les étapes case par case', () => {
      player.position = 0;
      const result = movePlayer(player, createDiceRoll(1, 2)); // total = 3
      expect(result.steps).toEqual([1, 2, 3]);
    });
  });

  describe('movePlayerTo', () => {
    it('déplace vers une case précise', () => {
      player.position = 5;
      const result = movePlayerTo(player, 37);
      expect(player.position).toBe(37);
      expect(result.from).toBe(5);
      expect(result.to).toBe(37);
    });

    it('donne 200€ si on passe par Départ en avançant', () => {
      player.position = 35;
      movePlayerTo(player, 5);
      expect(player.balance).toBe(STARTING_BALANCE + 200);
    });

    it('donne 200€ si destination est Départ', () => {
      player.position = 35;
      movePlayerTo(player, 0);
      expect(player.balance).toBe(STARTING_BALANCE + 200);
    });

    it('pas de 200€ si on avance sans passer par Départ', () => {
      player.position = 5;
      movePlayerTo(player, 20);
      expect(player.balance).toBe(STARTING_BALANCE);
    });
  });

  describe('movePlayerBack', () => {
    it('recule le joueur', () => {
      player.position = 7;
      const result = movePlayerBack(player, 3);
      expect(player.position).toBe(4);
      expect(result.from).toBe(7);
      expect(result.to).toBe(4);
    });

    it('wrappe en reculant', () => {
      player.position = 1;
      const result = movePlayerBack(player, 3);
      expect(player.position).toBe(38);
      expect(result.passedGo).toBe(false); // pas de 200€ en reculant
    });

    it('ne donne jamais 200€', () => {
      player.position = 1;
      movePlayerBack(player, 3);
      expect(player.balance).toBe(STARTING_BALANCE);
    });
  });
});
