/**
 * AI Strategy — Application Layer
 *
 * Heuristiques de décision pour l IA.
 * Niveau "Compétent" : scoring simple, pas de minimax.
 */

import {
  type GameState,
  type PlayerId,
  type OwnedProperty,
  SquareType,
} from '@game-logic/types';
import { getSquare } from '@game-logic/board/board';
import { hasMonopoly, wouldCompleteGroup, hasGroupMember } from '@game-logic/board/property-group';
import { canBuild } from '@game-logic/rules/building';
import { STATION_INDICES } from '@game-logic/constants';

// ─── Cases à fort trafic (statistiquement les plus visitées) ─────────

const HIGH_TRAFFIC_SQUARES = new Set([5, 15, 16, 18, 19, 21, 23, 24, 25]);

/**
 * Evaluer l interet d acheter une propriete.
 * Score > 60 → acheter.
 */
export function evaluatePurchase(
  squareIndex: number,
  state: GameState,
  aiId: PlayerId,
): number {
  const square = getSquare(squareIndex);
  let score = 50;

  // Gares : toujours interessantes
  if (square.type === SquareType.STATION) {
    score += 15;
    const ownedStations = state.properties.filter(
      (p) => p.ownerId === aiId && STATION_INDICES.includes(p.squareIndex),
    ).length;
    score += ownedStations * 10; // Plus on en a, plus ca vaut le coup
    return score;
  }

  // Compagnies : moderement interessantes
  if (square.type === SquareType.UTILITY) {
    score += 5;
    return score;
  }

  // Proprietes de couleur
  if (square.type === SquareType.PROPERTY) {
    // Completer un monopole → priorite maximale
    if (wouldCompleteGroup(squareIndex, aiId, state.properties)) {
      score += 25;
    }
    // Deja un membre du groupe → interessant
    else if (hasGroupMember(square.color, aiId, state.properties)) {
      score += 15;
    }

    // Case a fort trafic
    if (HIGH_TRAFFIC_SQUARES.has(squareIndex)) {
      score += 10;
    }

    // Securite financiere : ne pas se ruiner
    const player = state.players.find((p) => p.id === aiId);
    if (player && player.balance - square.price < 300) {
      score -= 20;
    }
    if (player && player.balance - square.price < 100) {
      score -= 20;
    }
  }

  return score;
}

/**
 * Determiner sur quelles proprietes construire.
 * Retourne les indices des cases ou construire.
 *
 * Regles IA :
 * - Monopole possede requis
 * - Solde > 2x cout d une maison
 * - Solde >= 500€ apres construction
 * - Priorite orange et rouge
 */
export function evaluateBuilding(
  state: GameState,
  aiId: PlayerId,
): number[] {
  const player = state.players.find((p) => p.id === aiId);
  if (!player) return [];
  if (player.balance < 500) return [];

  const targets: Array<{ squareIndex: number; priority: number }> = [];

  // Groupes prioritaires (orange, rouge, jaune, vert, bleu fonce, rose, bleu clair, violet)
  const priorityOrder = ['ORANGE', 'RED', 'YELLOW', 'GREEN', 'DARK_BLUE', 'PINK', 'LIGHT_BLUE', 'VIOLET'];

  for (const prop of state.properties) {
    if (prop.ownerId !== aiId) continue;
    if (prop.houses >= 3) continue; // Ne pas surbuilder

    const square = getSquare(prop.squareIndex);
    if (square.type !== SquareType.PROPERTY) continue;

    // Verifier qu on peut construire
    const check = canBuild(prop.squareIndex, aiId, state);
    if (!check.success) continue;

    // Verifier que le solde reste > 500 apres construction
    if (player.balance - check.data.cost < 500) continue;

    const priorityIdx = priorityOrder.indexOf(square.color);
    const priority = priorityIdx >= 0 ? priorityOrder.length - priorityIdx : 0;

    targets.push({ squareIndex: prop.squareIndex, priority });
  }

  // Trier par priorite decroissante, ne construire que sur 1-2 cases par tour
  targets.sort((a, b) => b.priority - a.priority);
  return targets.slice(0, 2).map((t) => t.squareIndex);
}
