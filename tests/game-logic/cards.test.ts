/**
 * Tests — Cards
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CHANCE_CARDS, COMMUNITY_CARDS } from '../../src/game-logic/cards/card-definitions';
import { drawChanceCard, drawCommunityCard } from '../../src/game-logic/cards/card-deck';
import { applyCardEffect } from '../../src/game-logic/cards/card-effects';
import { createGameState } from '../../src/game-logic/state/game-state';
import { createHumanPlayer, createAIPlayer, resetPlayerIdCounter } from '../../src/game-logic/player/player-factory';
import { type GameState, type Player, type OwnedProperty, CardEffectType } from '../../src/game-logic/types';
import { STARTING_BALANCE } from '../../src/game-logic/constants';

describe('Cards', () => {
  let p1: Player;
  let p2: Player;
  let state: GameState;

  beforeEach(() => {
    resetPlayerIdCounter();
    p1 = createHumanPlayer('Alice', 0);
    p2 = createAIPlayer('Bot', 1);
    state = createGameState([p1, p2]);
  });

  describe('card-definitions', () => {
    it('10 cartes Chance', () => {
      expect(CHANCE_CARDS).toHaveLength(10);
    });

    it('10 cartes Caisse de Communauté', () => {
      expect(COMMUNITY_CARDS).toHaveLength(10);
    });

    it('chaque carte a un id unique dans son deck', () => {
      const chanceIds = CHANCE_CARDS.map((c) => c.id);
      expect(new Set(chanceIds).size).toBe(10);

      const communityIds = COMMUNITY_CARDS.map((c) => c.id);
      expect(new Set(communityIds).size).toBe(10);
    });
  });

  describe('card-deck', () => {
    it('drawChanceCard retourne une carte valide et fait la rotation', () => {
      // Forcer un deck connu
      (state as { chanceDeck: number[] }).chanceDeck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

      const card1 = drawChanceCard(state);
      expect(card1.id).toBe(0);
      expect((state.chanceDeck as number[])[0]).toBe(1); // 0 est passé en dernier

      const card2 = drawChanceCard(state);
      expect(card2.id).toBe(1);
    });

    it('drawCommunityCard retourne une carte valide et fait la rotation', () => {
      (state as { communityDeck: number[] }).communityDeck = [5, 3, 7, 0, 1, 2, 4, 6, 8, 9];

      const card = drawCommunityCard(state);
      expect(card.id).toBe(5);
    });
  });

  describe('card-effects', () => {
    it('MOVE_TO — avance au Départ + 200€', () => {
      p1.position = 15;
      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.MOVE_TO && c.destination === 0)!;
      const result = applyCardEffect(card, p1, state);

      expect(p1.position).toBe(0);
      expect(result.moved).toBe(true);
      expect(result.balanceChange).toBe(200);
      expect(p1.balance).toBe(STARTING_BALANCE + 200);
    });

    it('GO_TO_JAIL — envoie en prison', () => {
      p1.position = 22;
      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.GO_TO_JAIL)!;
      const result = applyCardEffect(card, p1, state);

      expect(p1.inJail).toBe(true);
      expect(p1.position).toBe(10);
      expect(result.jailed).toBe(true);
    });

    it('PAY — déduit de l\'argent', () => {
      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.PAY)!;
      const result = applyCardEffect(card, p1, state);

      expect(result.balanceChange).toBe(-(card.value ?? 0));
      expect(p1.balance).toBe(STARTING_BALANCE - (card.value ?? 0));
    });

    it('RECEIVE — ajoute de l\'argent', () => {
      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.RECEIVE)!;
      const result = applyCardEffect(card, p1, state);

      expect(result.balanceChange).toBe(card.value ?? 0);
      expect(p1.balance).toBe(STARTING_BALANCE + (card.value ?? 0));
    });

    it('COLLECT_FROM_ALL — collecte des autres joueurs', () => {
      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.COLLECT_FROM_ALL)!;
      const amount = card.value ?? 0;
      const result = applyCardEffect(card, p1, state);

      // 1 autre joueur actif → reçoit 1× amount
      expect(result.balanceChange).toBe(amount);
      expect(p1.balance).toBe(STARTING_BALANCE + amount);
      expect(p2.balance).toBe(STARTING_BALANCE - amount);
    });

    it('PAY_REPAIRS — calcule selon maisons/hôtels', () => {
      // Donner des propriétés avec bâtiments
      (state.properties as OwnedProperty[]).push({ squareIndex: 1, ownerId: p1.id, houses: 3 }); // 3 maisons
      (state.properties as OwnedProperty[]).push({ squareIndex: 3, ownerId: p1.id, houses: 5 }); // 1 hôtel

      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.PAY_REPAIRS)!;
      // perHouse=25, perHotel=100 → 3×25 + 1×100 = 175
      const result = applyCardEffect(card, p1, state);

      expect(result.balanceChange).toBe(-175);
      expect(p1.balance).toBe(STARTING_BALANCE - 175);
    });

    it('GET_OUT_OF_JAIL — donne une carte', () => {
      expect(p1.getOutOfJailCards).toBe(0);
      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.GET_OUT_OF_JAIL)!;
      const result = applyCardEffect(card, p1, state);

      expect(result.gotJailCard).toBe(true);
      expect(p1.getOutOfJailCards).toBe(1);
    });

    it('MOVE_BY — recule de 3 cases', () => {
      p1.position = 7; // case Chance
      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.MOVE_BY)!;
      const result = applyCardEffect(card, p1, state);

      expect(p1.position).toBe(4); // 7 - 3
      expect(result.moved).toBe(true);
    });

    it('MOVE_TO_NEAREST_STATION — avance à la gare la plus proche', () => {
      p1.position = 7; // entre gare 5 et gare 15
      const card = CHANCE_CARDS.find((c) => c.effect === CardEffectType.MOVE_TO_NEAREST_STATION)!;
      const result = applyCardEffect(card, p1, state);

      expect(p1.position).toBe(15); // gare de Lyon
      expect(result.moved).toBe(true);
    });
  });
});
