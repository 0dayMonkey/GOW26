/**
 * Board Definition — Game Logic Layer
 *
 * Définition statique des 40 cases du Monopoly français.
 * Données pures, aucune logique.
 */

import {
  type Square,
  type PropertySquare,
  type StationSquare,
  type UtilitySquare,
  type TaxSquare,
  type SpecialSquare,
  SquareType,
  ColorGroup,
} from '../types';

// ─── Helpers de construction ─────────────────────────────────────────

function property(
  index: number,
  name: string,
  color: ColorGroup,
  price: number,
  houseCost: number,
  rent: [number, number, number, number, number, number],
): PropertySquare {
  return { type: SquareType.PROPERTY, index, name, color, price, houseCost, rent };
}

function station(index: number, name: string): StationSquare {
  return { type: SquareType.STATION, index, name, price: 200 };
}

function utility(index: number, name: string): UtilitySquare {
  return { type: SquareType.UTILITY, index, name, price: 150 };
}

function tax(index: number, name: string, amount: number): TaxSquare {
  return { type: SquareType.TAX, index, name, amount };
}

function special(
  index: number,
  name: string,
  type: SpecialSquare['type'],
): SpecialSquare {
  return { type, index, name };
}

// ─── Les 40 cases ────────────────────────────────────────────────────

export const BOARD_SQUARES: readonly Square[] = [
  /* 00 */ special(0, 'Départ', SquareType.GO),
  /* 01 */ property(1, 'Boulevard Méditerranée', ColorGroup.VIOLET, 60, 50, [2, 10, 30, 90, 160, 250]),
  /* 02 */ special(2, 'Caisse de Communauté', SquareType.COMMUNITY_CHEST),
  /* 03 */ property(3, 'Avenue du Parc', ColorGroup.VIOLET, 60, 50, [4, 20, 60, 180, 320, 450]),
  /* 04 */ tax(4, 'Impôts sur le Revenu', 200),
  /* 05 */ station(5, 'Gare Montparnasse'),
  /* 06 */ property(6, 'Avenue de Champagne', ColorGroup.LIGHT_BLUE, 100, 50, [6, 30, 90, 270, 400, 550]),
  /* 07 */ special(7, 'Chance', SquareType.CHANCE),
  /* 08 */ property(8, 'Avenue de Verdun', ColorGroup.LIGHT_BLUE, 100, 50, [6, 30, 90, 270, 400, 550]),
  /* 09 */ property(9, 'Rue de la Paix', ColorGroup.LIGHT_BLUE, 120, 50, [8, 40, 100, 300, 450, 600]),
  /* 10 */ special(10, 'Prison / Simple visite', SquareType.JAIL),
  /* 11 */ property(11, 'Boulevard de la Villette', ColorGroup.PINK, 140, 100, [10, 50, 150, 450, 625, 750]),
  /* 12 */ utility(12, "Compagnie d'Électricité"),
  /* 13 */ property(13, 'Avenue de Neuilly', ColorGroup.PINK, 140, 100, [10, 50, 150, 450, 625, 750]),
  /* 14 */ property(14, 'Avenue de Vaugirard', ColorGroup.PINK, 160, 100, [12, 60, 180, 500, 700, 900]),
  /* 15 */ station(15, 'Gare de Lyon'),
  /* 16 */ property(16, "Boulevard d'Italie", ColorGroup.ORANGE, 180, 100, [14, 70, 200, 550, 750, 950]),
  /* 17 */ special(17, 'Caisse de Communauté', SquareType.COMMUNITY_CHEST),
  /* 18 */ property(18, 'Avenue de Clichy', ColorGroup.ORANGE, 180, 100, [14, 70, 200, 550, 750, 950]),
  /* 19 */ property(19, 'Rue Lafayette', ColorGroup.ORANGE, 200, 100, [16, 80, 220, 600, 800, 1000]),
  /* 20 */ special(20, 'Parc Gratuit', SquareType.FREE_PARKING),
  /* 21 */ property(21, 'Avenue du Président Wilson', ColorGroup.RED, 220, 150, [18, 90, 250, 700, 875, 1050]),
  /* 22 */ special(22, 'Chance', SquareType.CHANCE),
  /* 23 */ property(23, 'Boulevard Saint-Michel', ColorGroup.RED, 220, 150, [18, 90, 250, 700, 875, 1050]),
  /* 24 */ property(24, 'Avenue Victor Hugo', ColorGroup.RED, 240, 150, [20, 100, 300, 750, 925, 1100]),
  /* 25 */ station(25, 'Gare du Nord'),
  /* 26 */ property(26, 'Avenue de la Bourdonnais', ColorGroup.YELLOW, 260, 150, [22, 110, 330, 800, 975, 1150]),
  /* 27 */ property(27, 'Avenue Mozart', ColorGroup.YELLOW, 260, 150, [22, 110, 330, 800, 975, 1150]),
  /* 28 */ utility(28, 'Compagnie des Eaux'),
  /* 29 */ property(29, 'Rue du Faubourg Saint-Honoré', ColorGroup.YELLOW, 280, 150, [24, 120, 360, 850, 1025, 1200]),
  /* 30 */ special(30, 'Va en Prison', SquareType.GO_TO_JAIL),
  /* 31 */ property(31, 'Avenue Henri Martin', ColorGroup.GREEN, 300, 200, [26, 130, 390, 900, 1100, 1275]),
  /* 32 */ property(32, 'Boulevard des Capucines', ColorGroup.GREEN, 300, 200, [28, 150, 450, 1000, 1200, 1400]),
  /* 33 */ special(33, 'Caisse de Communauté', SquareType.COMMUNITY_CHEST),
  /* 34 */ property(34, 'Avenue de Breteuil', ColorGroup.GREEN, 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  /* 35 */ station(35, 'Gare Saint-Lazare'),
  /* 36 */ special(36, 'Chance', SquareType.CHANCE),
  /* 37 */ property(37, 'Avenue Matignon', ColorGroup.DARK_BLUE, 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  /* 38 */ tax(38, 'Taxe de Luxe', 100),
  /* 39 */ property(39, 'Boulevard du Montparnasse', ColorGroup.DARK_BLUE, 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

/**
 * Accès typé à une case par index.
 */
export function getSquare(index: number): Square {
  const square = BOARD_SQUARES[index];
  if (!square) {
    throw new Error(`Case invalide: ${index}`);
  }
  return square;
}
