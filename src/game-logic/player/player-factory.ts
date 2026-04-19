/**
 * Player Factory — Game Logic Layer
 *
 * Crée les joueurs avec les valeurs initiales.
 */

import { type Player } from '../types';
import { STARTING_BALANCE } from '../constants';

let nextId = 0;

function generateId(prefix: string): string {
  nextId++;
  return `${prefix}-${nextId}`;
}

/**
 * Créer un joueur humain.
 */
export function createHumanPlayer(name: string, pawnIndex: number): Player {
  return {
    id: generateId('human'),
    name,
    isAI: false,
    pawnIndex,
    position: 0,
    balance: STARTING_BALANCE,
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    jailCardOrigins: [],
    isBankrupt: false,
    doublesCount: 0,
  };
}

/**
 * Créer un joueur IA.
 */
export function createAIPlayer(name: string, pawnIndex: number): Player {
  return {
    id: generateId('ai'),
    name,
    isAI: true,
    pawnIndex,
    position: 0,
    balance: STARTING_BALANCE,
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    jailCardOrigins: [],
    isBankrupt: false,
    doublesCount: 0,
  };
}

/**
 * Reset du compteur d'ID (pour les tests).
 */
export function resetPlayerIdCounter(): void {
  nextId = 0;
}
