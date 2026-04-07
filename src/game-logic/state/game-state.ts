/**
 * Game State — Game Logic Layer
 *
 * Création de l'état initial et fonctions de requête.
 */

import {
  type GameState,
  type Player,
  type OwnedProperty,
  type PlayerId,
  type SquareIndex,
  TurnPhase,
} from '../types';
import { getActivePlayers } from '../player/player';

/**
 * Créer un état de jeu initial.
 */
export function createGameState(players: Player[]): GameState {
  return {
    players,
    properties: [],
    currentPlayerIndex: 0,
    phase: TurnPhase.WAITING_FOR_ROLL,
    chanceDeck: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    communityDeck: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    turnCount: 0,
    lastDiceRoll: null,
  };
}

/**
 * Joueur dont c'est le tour.
 */
export function getCurrentPlayer(state: GameState): Player {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error('Index joueur invalide');
  return player;
}

/**
 * Passer au joueur actif suivant.
 */
export function advanceToNextPlayer(state: GameState): void {
  const activePlayers = getActivePlayers(state.players);
  if (activePlayers.length <= 1) return;

  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  } while (state.players[state.currentPlayerIndex]!.isBankrupt);

  state.turnCount++;
}

/**
 * Trouver le propriétaire d'une case.
 */
export function getPropertyOwner(
  state: GameState,
  squareIndex: SquareIndex,
): OwnedProperty | undefined {
  return (state.properties as OwnedProperty[]).find((p) => p.squareIndex === squareIndex);
}

/**
 * Ajouter une propriété possédée.
 */
export function addOwnedProperty(
  state: GameState,
  squareIndex: SquareIndex,
  ownerId: PlayerId,
): void {
  (state.properties as OwnedProperty[]).push({
    squareIndex,
    ownerId,
    houses: 0,
  });
}

/**
 * La partie est-elle terminée ? (1 seul joueur actif restant)
 */
export function isGameOver(state: GameState): boolean {
  return getActivePlayers(state.players).length <= 1;
}

/**
 * ID du gagnant (dernier joueur actif).
 */
export function getWinner(state: GameState): PlayerId | null {
  const active = getActivePlayers(state.players);
  if (active.length === 1) return active[0]!.id;
  return null;
}

// ─── Utilitaire ──────────────────────────────────────────────────────

function shuffle(arr: number[]): number[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
