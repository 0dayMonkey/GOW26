/**
 * Tests — Jail
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  jailPlayer,
  tryRollOutOfJail,
  payJailFine,
  useGetOutOfJailCard,
  canRollInJail,
  JailAction,
} from '../../src/game-logic/rules/jail';
import { createHumanPlayer, resetPlayerIdCounter } from '../../src/game-logic/player/player-factory';
import { createDiceRoll } from '../../src/game-logic/rules/dice';
import { type Player } from '../../src/game-logic/types';
import { STARTING_BALANCE, JAIL_FINE } from '../../src/game-logic/constants';

describe('Jail', () => {
  let player: Player;

  beforeEach(() => {
    resetPlayerIdCounter();
    player = createHumanPlayer('Alice', 0);
  });

  describe('jailPlayer', () => {
    it('envoie le joueur en prison', () => {
      player.position = 30;
      jailPlayer(player);
      expect(player.inJail).toBe(true);
      expect(player.position).toBe(10);
      expect(player.jailTurns).toBe(0);
      expect(player.doublesCount).toBe(0);
    });
  });

  describe('tryRollOutOfJail', () => {
    beforeEach(() => {
      jailPlayer(player);
    });

    it('libère sur un double', () => {
      const result = tryRollOutOfJail(player, createDiceRoll(3, 3));
      expect(result.released).toBe(true);
      expect(result.action).toBe(JailAction.ROLL_DOUBLES);
      expect(player.inJail).toBe(false);
    });

    it('reste en prison sans double', () => {
      const result = tryRollOutOfJail(player, createDiceRoll(2, 5));
      expect(result.released).toBe(false);
      expect(player.inJail).toBe(true);
      expect(player.jailTurns).toBe(1);
    });

    it('force le paiement au 3ème tour sans double', () => {
      tryRollOutOfJail(player, createDiceRoll(2, 5)); // tour 1
      tryRollOutOfJail(player, createDiceRoll(1, 4)); // tour 2
      const result = tryRollOutOfJail(player, createDiceRoll(3, 6)); // tour 3

      expect(result.released).toBe(true);
      expect(result.action).toBe(JailAction.PAY_FINE);
      expect(result.finePaid).toBe(JAIL_FINE);
      expect(player.inJail).toBe(false);
      expect(player.balance).toBe(STARTING_BALANCE - JAIL_FINE);
    });
  });

  describe('payJailFine', () => {
    it('libère le joueur contre 50€', () => {
      jailPlayer(player);
      const result = payJailFine(player);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.released).toBe(true);
        expect(result.data.finePaid).toBe(JAIL_FINE);
      }
      expect(player.inJail).toBe(false);
      expect(player.balance).toBe(STARTING_BALANCE - JAIL_FINE);
    });

    it('échoue si pas en prison', () => {
      const result = payJailFine(player);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_IN_JAIL');
      }
    });

    it('échoue si fonds insuffisants', () => {
      jailPlayer(player);
      player.balance = 10;
      const result = payJailFine(player);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INSUFFICIENT_FUNDS');
      }
    });
  });

  describe('useGetOutOfJailCard', () => {
    it('libère le joueur avec une carte', () => {
      jailPlayer(player);
      player.getOutOfJailCards = 1;
      const result = useGetOutOfJailCard(player);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.released).toBe(true);
        expect(result.data.action).toBe(JailAction.USE_CARD);
      }
      expect(player.inJail).toBe(false);
      expect(player.getOutOfJailCards).toBe(0);
    });

    it('échoue sans carte', () => {
      jailPlayer(player);
      const result = useGetOutOfJailCard(player);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_CARD');
      }
    });

    it('échoue si pas en prison', () => {
      player.getOutOfJailCards = 1;
      const result = useGetOutOfJailCard(player);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_IN_JAIL');
      }
    });
  });

  describe('canRollInJail', () => {
    it('true si en prison et tours restants', () => {
      jailPlayer(player);
      expect(canRollInJail(player)).toBe(true);
    });

    it('false si pas en prison', () => {
      expect(canRollInJail(player)).toBe(false);
    });

    it('false si 3 tours écoulés', () => {
      jailPlayer(player);
      player.jailTurns = 3;
      expect(canRollInJail(player)).toBe(false);
    });
  });
});
