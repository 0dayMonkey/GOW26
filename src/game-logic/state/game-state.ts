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
 * Un `randomFn` optionnel permet un mélange déterministe (tests, replay).
 */
export function createGameState(
  players: Player[],
  randomFn: () => number = Math.random,
): GameState {
  return {
    players,
    properties: [],
    currentPlayerIndex: 0,
    phase: TurnPhase.WAITING_FOR_ROLL,
    chanceDeck: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], randomFn),
    communityDeck: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], randomFn),
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
 * Garde-fou contre une boucle infinie si l'invariant "1+ joueur actif" est rompu.
 */
export function advanceToNextPlayer(state: GameState): void {
  const activePlayers = getActivePlayers(state.players);
  if (activePlayers.length <= 1) return;

  let safety = state.players.length + 1;
  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    safety--;
  } while (state.players[state.currentPlayerIndex]!.isBankrupt && safety > 0);

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

/**
 * Transfère les propriétés et cartes "Sortez de prison" d'un joueur en faillite
 * vers un créancier (autre joueur) ou vers la banque (creditorId = null).
 *
 * - Faillite vers joueur : propriétés (avec bâtiments) transférées telles quelles,
 *   cartes "Sortez de prison" transférées au créancier.
 * - Faillite vers banque : propriétés retirées (redeviennent achetables),
 *   cartes "Sortez de prison" remises dans les decks (chance d'abord).
 */
export function transferBankruptAssets(
  state: GameState,
  bankruptId: PlayerId,
  creditorId: PlayerId | null,
): void {
  const bankrupt = state.players.find((p) => p.id === bankruptId);
  if (!bankrupt) return;

  const props = state.properties as OwnedProperty[];

  if (creditorId) {
    // Transfert au créancier : propriétés conservées, bâtiments inclus
    for (const prop of props) {
      if (prop.ownerId === bankruptId) {
        (prop as OwnedProperty).ownerId = creditorId;
      }
    }
    const creditor = state.players.find((p) => p.id === creditorId);
    if (creditor) {
      creditor.getOutOfJailCards += bankrupt.getOutOfJailCards;
      creditor.jailCardOrigins.push(...bankrupt.jailCardOrigins);
    }
  } else {
    // Retour à la banque : propriétés retirées (achetables à nouveau)
    const filtered = props.filter((p) => p.ownerId !== bankruptId);
    props.length = 0;
    props.push(...filtered);
    // Cartes "Sortez de prison" rendues aux decks d'origine
    for (const origin of bankrupt.jailCardOrigins) {
      const deck = origin === 'CHANCE'
        ? (state.chanceDeck as number[])
        : (state.communityDeck as number[]);
      if (!deck.includes(9)) deck.push(9);
    }
  }

  bankrupt.getOutOfJailCards = 0;
  bankrupt.jailCardOrigins.length = 0;
}

// ─── Utilitaire ──────────────────────────────────────────────────────

function shuffle(arr: number[], rand: () => number = Math.random): number[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
