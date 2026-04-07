/**
 * Card Definitions — Game Logic Layer (Cards)
 *
 * Définition statique des 20 cartes (10 Chance + 10 Caisse de Communauté).
 */

import { type CardDefinition, CardType, CardEffectType } from '../types';

export const CHANCE_CARDS: readonly CardDefinition[] = [
  {
    id: 0,
    type: CardType.CHANCE,
    description: 'Avancez jusqu\'au Départ. Recevez 200€.',
    effect: CardEffectType.MOVE_TO,
    destination: 0,
  },
  {
    id: 1,
    type: CardType.CHANCE,
    description: 'Avancez à la Gare la plus proche.',
    effect: CardEffectType.MOVE_TO_NEAREST_STATION,
  },
  {
    id: 2,
    type: CardType.CHANCE,
    description: 'Avancez à Avenue Matignon.',
    effect: CardEffectType.MOVE_TO,
    destination: 37,
  },
  {
    id: 3,
    type: CardType.CHANCE,
    description: 'Reculez de 3 cases.',
    effect: CardEffectType.MOVE_BY,
    value: -3,
  },
  {
    id: 4,
    type: CardType.CHANCE,
    description: 'Allez en Prison.',
    effect: CardEffectType.GO_TO_JAIL,
  },
  {
    id: 5,
    type: CardType.CHANCE,
    description: 'Payez 50€.',
    effect: CardEffectType.PAY,
    value: 50,
  },
  {
    id: 6,
    type: CardType.CHANCE,
    description: 'Recevez 150€.',
    effect: CardEffectType.RECEIVE,
    value: 150,
  },
  {
    id: 7,
    type: CardType.CHANCE,
    description: 'Recevez 50€ de chaque joueur.',
    effect: CardEffectType.COLLECT_FROM_ALL,
    value: 50,
  },
  {
    id: 8,
    type: CardType.CHANCE,
    description: 'Réparations : payez 25€ par maison et 100€ par hôtel.',
    effect: CardEffectType.PAY_REPAIRS,
    perHouse: 25,
    perHotel: 100,
  },
  {
    id: 9,
    type: CardType.CHANCE,
    description: 'Carte "Sortez de prison".',
    effect: CardEffectType.GET_OUT_OF_JAIL,
  },
];

export const COMMUNITY_CARDS: readonly CardDefinition[] = [
  {
    id: 0,
    type: CardType.COMMUNITY_CHEST,
    description: 'Avancez jusqu\'au Départ. Recevez 200€.',
    effect: CardEffectType.MOVE_TO,
    destination: 0,
  },
  {
    id: 1,
    type: CardType.COMMUNITY_CHEST,
    description: 'Allez en Prison.',
    effect: CardEffectType.GO_TO_JAIL,
  },
  {
    id: 2,
    type: CardType.COMMUNITY_CHEST,
    description: 'Héritage : recevez 200€.',
    effect: CardEffectType.RECEIVE,
    value: 200,
  },
  {
    id: 3,
    type: CardType.COMMUNITY_CHEST,
    description: 'Frais de médecin : payez 50€.',
    effect: CardEffectType.PAY,
    value: 50,
  },
  {
    id: 4,
    type: CardType.COMMUNITY_CHEST,
    description: 'Recevez 10€ de chaque joueur.',
    effect: CardEffectType.COLLECT_FROM_ALL,
    value: 10,
  },
  {
    id: 5,
    type: CardType.COMMUNITY_CHEST,
    description: 'Remboursement : recevez 100€.',
    effect: CardEffectType.RECEIVE,
    value: 100,
  },
  {
    id: 6,
    type: CardType.COMMUNITY_CHEST,
    description: 'Amende : payez 100€.',
    effect: CardEffectType.PAY,
    value: 100,
  },
  {
    id: 7,
    type: CardType.COMMUNITY_CHEST,
    description: 'Réparations : payez 40€ par maison et 115€ par hôtel.',
    effect: CardEffectType.PAY_REPAIRS,
    perHouse: 40,
    perHotel: 115,
  },
  {
    id: 8,
    type: CardType.COMMUNITY_CHEST,
    description: 'Services : recevez 25€.',
    effect: CardEffectType.RECEIVE,
    value: 25,
  },
  {
    id: 9,
    type: CardType.COMMUNITY_CHEST,
    description: 'Carte "Sortez de prison".',
    effect: CardEffectType.GET_OUT_OF_JAIL,
  },
];
