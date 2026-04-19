/**
 * Card Effects — Game Logic Layer (Cards)
 *
 * Applique l'effet d'une carte tirée sur le joueur et le GameState.
 */

import {
  type Player,
  type GameState,
  type CardDefinition,
  CardEffectType,
} from '../types';
import { adjustBalance, sendToJail, getActivePlayers } from '../player/player';
import { movePlayerTo, movePlayerBack } from '../rules/movement';
import { nearestStation } from '../board/board';
import { countPlayerHouses, countPlayerHotels } from '../rules/building';
import { BOARD_SIZE } from '../constants';

export interface CardEffectResult {
  readonly description: string;
  readonly balanceChange: number;
  readonly moved: boolean;
  readonly jailed: boolean;
  readonly gotJailCard: boolean;
}

/**
 * Appliquer l'effet d'une carte sur un joueur.
 */
export function applyCardEffect(
  card: CardDefinition,
  player: Player,
  state: GameState,
): CardEffectResult {
  switch (card.effect) {
    case CardEffectType.MOVE_TO:
      return handleMoveTo(card, player);

    case CardEffectType.MOVE_TO_NEAREST_STATION:
      return handleMoveToNearestStation(player);

    case CardEffectType.MOVE_BY:
      return handleMoveBy(card, player);

    case CardEffectType.GO_TO_JAIL:
      return handleGoToJail(player);

    case CardEffectType.PAY:
      return handlePay(card, player);

    case CardEffectType.RECEIVE:
      return handleReceive(card, player);

    case CardEffectType.COLLECT_FROM_ALL:
      return handleCollectFromAll(card, player, state);

    case CardEffectType.PAY_REPAIRS:
      return handlePayRepairs(card, player, state);

    case CardEffectType.GET_OUT_OF_JAIL:
      return handleGetOutOfJail(card, player);

    default:
      return { description: 'Effet inconnu', balanceChange: 0, moved: false, jailed: false, gotJailCard: false };
  }
}

function handleMoveTo(card: CardDefinition, player: Player): CardEffectResult {
  const dest = card.destination ?? 0;
  const balanceBefore = player.balance;
  movePlayerTo(player, dest);
  const balanceChange = player.balance - balanceBefore;

  return {
    description: card.description,
    balanceChange,
    moved: true,
    jailed: false,
    gotJailCard: false,
  };
}

function handleMoveToNearestStation(player: Player): CardEffectResult {
  const dest = nearestStation(player.position);
  const balanceBefore = player.balance;
  movePlayerTo(player, dest);
  const balanceChange = player.balance - balanceBefore;

  return {
    description: `Avancez à la gare la plus proche (case ${dest}).`,
    balanceChange,
    moved: true,
    jailed: false,
    gotJailCard: false,
  };
}

function handleMoveBy(card: CardDefinition, player: Player): CardEffectResult {
  const steps = card.value ?? 0;
  const balanceBefore = player.balance;
  if (steps < 0) {
    movePlayerBack(player, Math.abs(steps));
  } else {
    movePlayerTo(player, (player.position + steps) % BOARD_SIZE);
  }

  return {
    description: card.description,
    balanceChange: player.balance - balanceBefore,
    moved: true,
    jailed: false,
    gotJailCard: false,
  };
}

function handleGoToJail(player: Player): CardEffectResult {
  sendToJail(player);
  return {
    description: 'Allez en Prison.',
    balanceChange: 0,
    moved: true,
    jailed: true,
    gotJailCard: false,
  };
}

function handlePay(card: CardDefinition, player: Player): CardEffectResult {
  const amount = card.value ?? 0;
  adjustBalance(player, -amount);
  return {
    description: card.description,
    balanceChange: -amount,
    moved: false,
    jailed: false,
    gotJailCard: false,
  };
}

function handleReceive(card: CardDefinition, player: Player): CardEffectResult {
  const amount = card.value ?? 0;
  adjustBalance(player, amount);
  return {
    description: card.description,
    balanceChange: amount,
    moved: false,
    jailed: false,
    gotJailCard: false,
  };
}

function handleCollectFromAll(
  card: CardDefinition,
  player: Player,
  state: GameState,
): CardEffectResult {
  const amount = card.value ?? 0;
  const others = getActivePlayers(state.players).filter((p) => p.id !== player.id);
  let totalCollected = 0;

  for (const other of others) {
    adjustBalance(other as Player, -amount);
    totalCollected += amount;
  }

  adjustBalance(player, totalCollected);

  return {
    description: card.description,
    balanceChange: totalCollected,
    moved: false,
    jailed: false,
    gotJailCard: false,
  };
}

function handlePayRepairs(
  card: CardDefinition,
  player: Player,
  state: GameState,
): CardEffectResult {
  const perHouse = card.perHouse ?? 0;
  const perHotel = card.perHotel ?? 0;
  const houses = countPlayerHouses(player.id, state.properties);
  const hotels = countPlayerHotels(player.id, state.properties);
  const totalCost = houses * perHouse + hotels * perHotel;

  adjustBalance(player, -totalCost);

  return {
    description: `${card.description} (${houses} maisons, ${hotels} hôtels = ${totalCost}€)`,
    balanceChange: -totalCost,
    moved: false,
    jailed: false,
    gotJailCard: false,
  };
}

function handleGetOutOfJail(card: CardDefinition, player: Player): CardEffectResult {
  player.getOutOfJailCards++;
  player.jailCardOrigins.push(card.type);
  return {
    description: 'Carte "Sortez de prison" — conservée.',
    balanceChange: 0,
    moved: false,
    jailed: false,
    gotJailCard: true,
  };
}
