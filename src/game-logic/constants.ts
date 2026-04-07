/**
 * Constants — Game Logic Layer
 *
 * Toutes les constantes partagées du jeu.
 */

// ─── Joueurs ─────────────────────────────────────────────────────────

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const STARTING_BALANCE = 1500;

// ─── Plateau ─────────────────────────────────────────────────────────

export const BOARD_SIZE = 40;
export const GO_SQUARE = 0;
export const JAIL_SQUARE = 10;
export const GO_TO_JAIL_SQUARE = 30;
export const FREE_PARKING_SQUARE = 20;

// ─── Règles ──────────────────────────────────────────────────────────

export const GO_SALARY = 200;
export const MAX_DOUBLES_BEFORE_JAIL = 3;
export const MAX_JAIL_TURNS = 3;
export const JAIL_FINE = 50;
export const MAX_HOUSES = 4;
export const HOTEL_LEVEL = 5;

// ─── Gares ───────────────────────────────────────────────────────────

export const STATION_PRICE = 200;
export const STATION_RENTS: readonly number[] = [25, 50, 100, 200];

// ─── Compagnies ──────────────────────────────────────────────────────

export const UTILITY_PRICE = 150;
export const UTILITY_MULTIPLIER_ONE = 4;
export const UTILITY_MULTIPLIER_BOTH = 10;

// ─── Taxes ───────────────────────────────────────────────────────────

export const INCOME_TAX = 200;
export const LUXURY_TAX = 100;

// ─── Indices des cases spéciales ─────────────────────────────────────

export const STATION_INDICES: readonly number[] = [5, 15, 25, 35];
export const UTILITY_INDICES: readonly number[] = [12, 28];
export const CHANCE_INDICES: readonly number[] = [7, 22, 36];
export const COMMUNITY_INDICES: readonly number[] = [2, 17, 33];

// ─── Groupes de couleurs → indices des propriétés ────────────────────

export const COLOR_GROUP_MEMBERS: Record<string, readonly number[]> = {
  VIOLET: [1, 3],
  LIGHT_BLUE: [6, 8, 9],
  PINK: [11, 13, 14],
  ORANGE: [16, 18, 19],
  RED: [21, 23, 24],
  YELLOW: [26, 27, 29],
  GREEN: [31, 32, 34],
  DARK_BLUE: [37, 39],
};

// ─── IA ──────────────────────────────────────────────────────────────

export const AI_THINK_DELAY_MS = {
  roll: 800,
  buy: 1200,
  build: 1500,
  endTurn: 600,
} as const;

// ─── Pions ───────────────────────────────────────────────────────────

export const PAWN_NAMES: readonly string[] = ['Chapeau', 'Fer à repasser', 'Voiture', 'Dé'];
