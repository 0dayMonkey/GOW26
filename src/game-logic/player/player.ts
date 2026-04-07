/**
 * Player — Game Logic Layer
 *
 * Fonctions pures de manipulation d'un joueur.
 */

import { type Player, type PlayerId } from '../types';
import { JAIL_SQUARE } from '../constants';

/**
 * Modifier le solde d'un joueur. Retourne le nouveau solde.
 */
export function adjustBalance(player: Player, amount: number): number {
  player.balance += amount;
  return player.balance;
}

/**
 * Le joueur peut-il payer un montant donné ?
 */
export function canAfford(player: Player, amount: number): boolean {
  return player.balance >= amount;
}

/**
 * Déplacer un joueur à une position.
 */
export function moveTo(player: Player, position: number): void {
  player.position = position;
}

/**
 * Envoyer un joueur en prison.
 */
export function sendToJail(player: Player): void {
  player.position = JAIL_SQUARE;
  player.inJail = true;
  player.jailTurns = 0;
  player.doublesCount = 0;
}

/**
 * Libérer un joueur de prison.
 */
export function releaseFromJail(player: Player): void {
  player.inJail = false;
  player.jailTurns = 0;
}

/**
 * Déclarer un joueur en faillite.
 */
export function declareBankrupt(player: Player): void {
  player.isBankrupt = true;
  player.balance = 0;
}

/**
 * Le joueur est-il encore actif (pas en faillite) ?
 */
export function isActive(player: Player): boolean {
  return !player.isBankrupt;
}

/**
 * Trouver un joueur par ID dans une liste.
 */
export function findPlayer(players: readonly Player[], id: PlayerId): Player | undefined {
  return players.find((p) => p.id === id);
}

/**
 * Joueurs encore actifs.
 */
export function getActivePlayers(players: readonly Player[]): readonly Player[] {
  return players.filter(isActive);
}
