/**
 * Types — Game Logic Layer
 *
 * Types partagés par toute la couche logique.
 * Aucune dépendance externe. Aucun import Babylon.js.
 */

// ─── Identifiants ────────────────────────────────────────────────────

export type PlayerId = string;
export type SquareIndex = number; // 0..39

// ─── Résultat typé ───────────────────────────────────────────────────

export interface GameError {
  readonly code: string;
  readonly message: string;
}

export type GameResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: GameError };

export function ok<T>(data: T): GameResult<T> {
  return { success: true, data };
}

export function fail<T>(code: string, message: string): GameResult<T> {
  return { success: false, error: { code, message } };
}

// ─── Dés ─────────────────────────────────────────────────────────────

export interface DiceRoll {
  readonly values: [number, number];
  readonly total: number;
  readonly isDouble: boolean;
}

// ─── Cases ───────────────────────────────────────────────────────────

export enum SquareType {
  PROPERTY = 'PROPERTY',
  STATION = 'STATION',
  UTILITY = 'UTILITY',
  TAX = 'TAX',
  CHANCE = 'CHANCE',
  COMMUNITY_CHEST = 'COMMUNITY_CHEST',
  GO = 'GO',
  JAIL = 'JAIL',
  GO_TO_JAIL = 'GO_TO_JAIL',
  FREE_PARKING = 'FREE_PARKING',
}

export enum ColorGroup {
  VIOLET = 'VIOLET',
  LIGHT_BLUE = 'LIGHT_BLUE',
  PINK = 'PINK',
  ORANGE = 'ORANGE',
  RED = 'RED',
  YELLOW = 'YELLOW',
  GREEN = 'GREEN',
  DARK_BLUE = 'DARK_BLUE',
}

export interface PropertySquare {
  readonly type: SquareType.PROPERTY;
  readonly index: SquareIndex;
  readonly name: string;
  readonly color: ColorGroup;
  readonly price: number;
  readonly houseCost: number;
  readonly rent: readonly [number, number, number, number, number, number]; // [nu, 1M, 2M, 3M, 4M, hôtel]
}

export interface StationSquare {
  readonly type: SquareType.STATION;
  readonly index: SquareIndex;
  readonly name: string;
  readonly price: number;
}

export interface UtilitySquare {
  readonly type: SquareType.UTILITY;
  readonly index: SquareIndex;
  readonly name: string;
  readonly price: number;
}

export interface TaxSquare {
  readonly type: SquareType.TAX;
  readonly index: SquareIndex;
  readonly name: string;
  readonly amount: number;
}

export interface SpecialSquare {
  readonly type:
    | SquareType.CHANCE
    | SquareType.COMMUNITY_CHEST
    | SquareType.GO
    | SquareType.JAIL
    | SquareType.GO_TO_JAIL
    | SquareType.FREE_PARKING;
  readonly index: SquareIndex;
  readonly name: string;
}

export type Square = PropertySquare | StationSquare | UtilitySquare | TaxSquare | SpecialSquare;

// ─── Propriétés possédées ────────────────────────────────────────────

export interface OwnedProperty {
  readonly squareIndex: SquareIndex;
  readonly ownerId: PlayerId;
  houses: number; // 0..4 maisons, 5 = hôtel
}

// ─── Joueur ──────────────────────────────────────────────────────────

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly isAI: boolean;
  readonly pawnIndex: number; // 0..3 → quel pion (chapeau, fer, voiture, dé)
  position: SquareIndex;
  balance: number;
  inJail: boolean;
  jailTurns: number;
  getOutOfJailCards: number;
  isBankrupt: boolean;
  doublesCount: number;
}

// ─── Cartes ──────────────────────────────────────────────────────────

export enum CardType {
  CHANCE = 'CHANCE',
  COMMUNITY_CHEST = 'COMMUNITY_CHEST',
}

export enum CardEffectType {
  MOVE_TO = 'MOVE_TO',
  MOVE_TO_NEAREST_STATION = 'MOVE_TO_NEAREST_STATION',
  MOVE_BY = 'MOVE_BY',
  GO_TO_JAIL = 'GO_TO_JAIL',
  PAY = 'PAY',
  RECEIVE = 'RECEIVE',
  COLLECT_FROM_ALL = 'COLLECT_FROM_ALL',
  PAY_REPAIRS = 'PAY_REPAIRS',
  GET_OUT_OF_JAIL = 'GET_OUT_OF_JAIL',
}

export interface CardDefinition {
  readonly id: number;
  readonly type: CardType;
  readonly description: string;
  readonly effect: CardEffectType;
  readonly value?: number;
  readonly destination?: SquareIndex;
  readonly perHouse?: number;
  readonly perHotel?: number;
}

// ─── État du jeu ─────────────────────────────────────────────────────

export enum TurnPhase {
  WAITING_FOR_ROLL = 'WAITING_FOR_ROLL',
  ROLLING = 'ROLLING',
  MOVING = 'MOVING',
  ACTION = 'ACTION',
  BUILDING = 'BUILDING',
  END_TURN = 'END_TURN',
}

export interface GameState {
  readonly players: readonly Player[];
  readonly properties: readonly OwnedProperty[];
  currentPlayerIndex: number;
  phase: TurnPhase;
  readonly chanceDeck: readonly number[];
  readonly communityDeck: readonly number[];
  turnCount: number;
  lastDiceRoll: DiceRoll | null;
}
