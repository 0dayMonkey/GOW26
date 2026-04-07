/**
 * BoardTextureGenerator — Presentation Layer
 *
 * Genere dynamiquement une texture 2048x2048 du plateau Monopoly
 * via Canvas 2D, appliquee ensuite comme DynamicTexture.
 *
 * Contient :
 * - Noms des rues (version francaise classique)
 * - Prix d achat
 * - Couleurs officielles des groupes
 * - Symboles (train, ampoule, goutte, chance, CC, taxes)
 * - Bordures nettes entre chaque case
 * - Cases d angle avec decoration
 *
 * [CERTAIN] API Babylon.js 7.x — DynamicTexture
 * [TRADE-OFF] 2048x2048 vs 4096x4096 : 2048 suffit pour la lisibilite
 *             et reste dans le budget GPU (< 512 KB en VRAM compressee).
 *             Si besoin de 4096, changer TEX_SIZE.
 */

import { DynamicTexture, Scene, Texture } from '@babylonjs/core';
import { BOARD_SQUARES } from '@game-logic/board/board-definition';
import { SquareType, ColorGroup, type Square, type PropertySquare, type TaxSquare } from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('BoardTextureGenerator');

// ─── Configuration texture ───────────────────────────────────────────

const TEX_SIZE = 2048;

/** Taille relative des coins et des cases normales dans l espace texture */
const CORNER_FRAC = 0.125;  // 12.5% du total par coin
const SIDE_FRAC = 1 - 2 * CORNER_FRAC; // 75% restant pour les 9 cases

/** Epaisseur des bordures en pixels */
const BORDER_WIDTH = 3;
const INNER_BORDER = 1;

/** Fraction de la case occupee par le bandeau couleur (proprietes) */
const COLOR_STRIP_FRAC = 0.22;

// ─── Couleurs des groupes (CSS) ──────────────────────────────────────

const GROUP_CSS: Record<string, string> = {
  [ColorGroup.VIOLET]:     '#8B45A6',
  [ColorGroup.LIGHT_BLUE]: '#AAD8E6',
  [ColorGroup.PINK]:       '#D93274',
  [ColorGroup.ORANGE]:     '#ED930F',
  [ColorGroup.RED]:        '#DB3328',
  [ColorGroup.YELLOW]:     '#F1E634',
  [ColorGroup.GREEN]:      '#1E8C2F',
  [ColorGroup.DARK_BLUE]:  '#003D99',
};

// ─── Couleur de fond par type de case speciale ───────────────────────

const SPECIAL_BG: Partial<Record<SquareType, string>> = {
  [SquareType.CHANCE]:          '#FFF8E1',
  [SquareType.COMMUNITY_CHEST]: '#E3F2FD',
  [SquareType.TAX]:             '#F5F5F5',
  [SquareType.STATION]:         '#FAFAFA',
  [SquareType.UTILITY]:         '#FAFAFA',
};

// ─── Couleurs des coins ─────────────────────────────────────────────

const CORNER_BG: Record<number, string> = {
  0:  '#E8F5E9',  // Depart
  10: '#FFF3E0',  // Prison
  20: '#E8F5E9',  // Parc Gratuit
  30: '#FFEBEE',  // Va en Prison
};

// ─── Symboles emoji/texte pour les cases speciales ───────────────────

const SPECIAL_SYMBOLS: Partial<Record<SquareType, string>> = {
  [SquareType.CHANCE]:          '?',
  [SquareType.COMMUNITY_CHEST]: '✉',
  [SquareType.STATION]:         '🚂',
  [SquareType.UTILITY]:         '⚡',
  [SquareType.TAX]:             '💰',
};

// ─── Types internes ──────────────────────────────────────────────────

interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
  side: number;      // 0=bas, 1=gauche, 2=haut, 3=droite
  isCorner: boolean;
  squareIndex: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generer la DynamicTexture du plateau Monopoly.
 * Le plateau est vu du dessus, orientation :
 * - Bas (sud)  : cases 0..9   (Depart en bas-droite)
 * - Gauche     : cases 10..19
 * - Haut       : cases 20..29
 * - Droite     : cases 30..39
 *
 * La texture est appliquee sur un plan horizontal.
 */
export function generateMonopolyBoardTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('board-texture', TEX_SIZE, scene, true);
  tex.hasAlpha = false;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;

  const ctx = tex.getContext() as CanvasRenderingContext2D;

  // 1. Fond du plateau
  drawBackground(ctx);

  // 2. Calculer les rectangles de chaque case
  const cells = computeCellRects();

  // 3. Dessiner chaque case
  for (const cell of cells) {
    const square = BOARD_SQUARES[cell.squareIndex]!;
    if (cell.isCorner) {
      drawCornerCell(ctx, cell, square);
    } else {
      drawNormalCell(ctx, cell, square);
    }
  }

  // 4. Dessiner le centre du plateau
  drawCenter(ctx);

  // 5. Bordures exterieures
  drawOuterBorder(ctx);

  tex.update();

  logger.info('Texture plateau generee (2048x2048)');
  return tex;
}

// ═══════════════════════════════════════════════════════════════════════
//  CALCUL DES RECTANGLES
// ═══════════════════════════════════════════════════════════════════════

function computeCellRects(): CellRect[] {
  const cornerPx = Math.round(TEX_SIZE * CORNER_FRAC);
  const sidePx = TEX_SIZE - 2 * cornerPx;
  const cellW = sidePx / 9;

  const cells: CellRect[] = [];

  for (let i = 0; i < 40; i++) {
    const side = Math.floor(i / 10);
    const idx = i % 10;
    const isCorner = idx === 0;

    let x: number, y: number, w: number, h: number;

    if (isCorner) {
      switch (side) {
        case 0: // Depart — bas-droite
          x = TEX_SIZE - cornerPx; y = TEX_SIZE - cornerPx;
          w = cornerPx; h = cornerPx;
          break;
        case 1: // Prison — bas-gauche
          x = 0; y = TEX_SIZE - cornerPx;
          w = cornerPx; h = cornerPx;
          break;
        case 2: // Parc Gratuit — haut-gauche
          x = 0; y = 0;
          w = cornerPx; h = cornerPx;
          break;
        case 3: // Va en Prison — haut-droite
          x = TEX_SIZE - cornerPx; y = 0;
          w = cornerPx; h = cornerPx;
          break;
        default:
          x = 0; y = 0; w = 0; h = 0;
      }
    } else {
      // Cases normales : positionnees sur le bord correspondant
      // L index 1 est le plus proche du coin precedent
      switch (side) {
        case 0: // Bas — de droite a gauche
          x = TEX_SIZE - cornerPx - idx * cellW;
          y = TEX_SIZE - cornerPx;
          w = cellW;
          h = cornerPx;
          break;
        case 1: // Gauche — de bas en haut
          x = 0;
          y = TEX_SIZE - cornerPx - idx * cellW;
          w = cornerPx;
          h = cellW;
          break;
        case 2: // Haut — de gauche a droite
          x = cornerPx + (idx - 1) * cellW;
          y = 0;
          w = cellW;
          h = cornerPx;
          break;
        case 3: // Droite — de haut en bas
          x = TEX_SIZE - cornerPx;
          y = cornerPx + (idx - 1) * cellW;
          w = cornerPx;
          h = cellW;
          break;
        default:
          x = 0; y = 0; w = 0; h = 0;
      }
    }

    cells.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), side, isCorner, squareIndex: i });
  }

  return cells;
}

// ═══════════════════════════════════════════════════════════════════════
//  DESSIN — FOND
// ═══════════════════════════════════════════════════════════════════════

function drawBackground(ctx: CanvasRenderingContext2D): void {
  // Fond vert classique Monopoly
  ctx.fillStyle = '#C8E6C0';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
}

// ═══════════════════════════════════════════════════════════════════════
//  DESSIN — CENTRE DU PLATEAU
// ═══════════════════════════════════════════════════════════════════════

function drawCenter(ctx: CanvasRenderingContext2D): void {
  const cornerPx = Math.round(TEX_SIZE * CORNER_FRAC);
  const innerX = cornerPx + 10;
  const innerY = cornerPx + 10;
  const innerW = TEX_SIZE - 2 * cornerPx - 20;
  const innerH = innerW;

  // Fond centre legerement different
  ctx.fillStyle = '#D4EDDA';
  ctx.fillRect(innerX, innerY, innerW, innerH);

  // Titre MONOPOLY au centre
  ctx.save();
  ctx.translate(TEX_SIZE / 2, TEX_SIZE / 2);

  // Ombre du texte
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  // Texte principal
  ctx.fillStyle = '#C41E3A';
  ctx.font = `bold ${Math.round(TEX_SIZE * 0.065)}px "Georgia", "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUFFAPOLY', 0, -20);

  // Sous-titre
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#333';
  ctx.font = `${Math.round(TEX_SIZE * 0.02)}px "Georgia", serif`;
  ctx.fillText('Édition Française', 0, 30);

  // Ligne decorative
  ctx.strokeStyle = '#C41E3A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-120, 55);
  ctx.lineTo(120, 55);
  ctx.stroke();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  DESSIN — CASE D ANGLE
// ═══════════════════════════════════════════════════════════════════════

function drawCornerCell(ctx: CanvasRenderingContext2D, cell: CellRect, square: Square): void {
  const { x, y, w, h, squareIndex } = cell;

  // Fond
  ctx.fillStyle = CORNER_BG[squareIndex] ?? '#FFFFFF';
  ctx.fillRect(x, y, w, h);

  // Bordure
  ctx.strokeStyle = '#333';
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeRect(x, y, w, h);

  // Contenu selon la case
  ctx.save();
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Rotation pour les coins : texte lisible selon l orientation
  let angle = 0;
  if (squareIndex === 0)  angle = -Math.PI / 4;  // Depart
  if (squareIndex === 10) angle = Math.PI / 4;    // Prison
  if (squareIndex === 20) angle = -Math.PI / 4;   // Parc Gratuit
  if (squareIndex === 30) angle = Math.PI / 4;    // Va en Prison

  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const fontSize = Math.round(w * 0.14);

  switch (squareIndex) {
    case 0: // DEPART
      ctx.fillStyle = '#D32F2F';
      ctx.font = `bold ${fontSize}px "Arial", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DÉPART', 0, -15);

      ctx.fillStyle = '#333';
      ctx.font = `${Math.round(fontSize * 0.65)}px "Arial", sans-serif`;
      ctx.fillText('Recevez 200€', 0, 15);

      // Fleche
      ctx.fillStyle = '#D32F2F';
      ctx.font = `${Math.round(fontSize * 1.2)}px "Arial", sans-serif`;
      ctx.fillText('→', 0, 45);
      break;

    case 10: // PRISON
      ctx.fillStyle = '#E65100';
      ctx.font = `bold ${fontSize}px "Arial", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PRISON', 0, -15);

      ctx.fillStyle = '#555';
      ctx.font = `${Math.round(fontSize * 0.6)}px "Arial", sans-serif`;
      ctx.fillText('Simple visite', 0, 15);

      // Barreaux symboliques
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 12, 30);
        ctx.lineTo(i * 12, 55);
        ctx.stroke();
      }
      break;

    case 20: // PARC GRATUIT
      ctx.fillStyle = '#2E7D32';
      ctx.font = `bold ${fontSize * 0.9}px "Arial", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PARC', 0, -20);
      ctx.fillText('GRATUIT', 0, 10);

      ctx.font = `${fontSize * 1.5}px "Arial", sans-serif`;
      ctx.fillText('🅿', 0, 50);
      break;

    case 30: // VA EN PRISON
      ctx.fillStyle = '#1A237E';
      ctx.font = `bold ${fontSize * 0.85}px "Arial", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ALLEZ', 0, -25);
      ctx.fillText('EN', 0, 0);
      ctx.fillText('PRISON', 0, 25);

      // Pointeur
      ctx.fillStyle = '#1A237E';
      ctx.font = `${fontSize * 1.2}px "Arial", sans-serif`;
      ctx.fillText('👮', 0, 55);
      break;
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  DESSIN — CASE NORMALE
// ═══════════════════════════════════════════════════════════════════════

function drawNormalCell(ctx: CanvasRenderingContext2D, cell: CellRect, square: Square): void {
  const { x, y, w, h, side, squareIndex } = cell;
  const isVertical = side === 0 || side === 2; // Cases orientees verticalement

  // Fond blanc de la case
  ctx.fillStyle = SPECIAL_BG[square.type] ?? '#FFFFF5';
  ctx.fillRect(x, y, w, h);

  // Bordure de la case
  ctx.strokeStyle = '#555';
  ctx.lineWidth = INNER_BORDER;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Bordure exterieure plus epaisse
  ctx.strokeStyle = '#333';
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeRect(x, y, w, h);

  // Dessiner le contenu selon le type
  if (square.type === SquareType.PROPERTY) {
    drawPropertyCell(ctx, cell, square as PropertySquare);
  } else if (square.type === SquareType.STATION) {
    drawStationCell(ctx, cell, square);
  } else if (square.type === SquareType.UTILITY) {
    drawUtilityCell(ctx, cell, square);
  } else if (square.type === SquareType.TAX) {
    drawTaxCell(ctx, cell, square as TaxSquare);
  } else if (square.type === SquareType.CHANCE) {
    drawChanceCell(ctx, cell);
  } else if (square.type === SquareType.COMMUNITY_CHEST) {
    drawCommunityCell(ctx, cell);
  }
}

// ─── Propriete de couleur ────────────────────────────────────────────

function drawPropertyCell(ctx: CanvasRenderingContext2D, cell: CellRect, square: PropertySquare): void {
  const { x, y, w, h, side } = cell;
  const isVertical = side === 0 || side === 2;
  const color = GROUP_CSS[square.color] ?? '#999';

  // Bandeau couleur — positionne vers l interieur du plateau
  const stripH = Math.round((isVertical ? h : w) * COLOR_STRIP_FRAC);

  ctx.fillStyle = color;
  switch (side) {
    case 0: // Bas — bandeau en haut de la case (vers le centre)
      ctx.fillRect(x + 2, y + 2, w - 4, stripH);
      break;
    case 1: // Gauche — bandeau a droite
      ctx.fillRect(x + w - stripH - 2, y + 2, stripH, h - 4);
      break;
    case 2: // Haut — bandeau en bas
      ctx.fillRect(x + 2, y + h - stripH - 2, w - 4, stripH);
      break;
    case 3: // Droite — bandeau a gauche
      ctx.fillRect(x + 2, y + 2, stripH, h - 4);
      break;
  }

  // Bordure du bandeau
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  switch (side) {
    case 0: ctx.strokeRect(x + 2, y + 2, w - 4, stripH); break;
    case 1: ctx.strokeRect(x + w - stripH - 2, y + 2, stripH, h - 4); break;
    case 2: ctx.strokeRect(x + 2, y + h - stripH - 2, w - 4, stripH); break;
    case 3: ctx.strokeRect(x + 2, y + 2, stripH, h - 4); break;
  }

  // Texte : nom + prix — oriente selon le cote
  drawRotatedText(ctx, cell, square.name, `${square.price}€`, stripH);
}

// ─── Gare ────────────────────────────────────────────────────────────

function drawStationCell(ctx: CanvasRenderingContext2D, cell: CellRect, square: Square): void {
  drawSpecialCell(ctx, cell, square.name, '🚂', '200€');
}

// ─── Compagnie ───────────────────────────────────────────────────────

function drawUtilityCell(ctx: CanvasRenderingContext2D, cell: CellRect, square: Square): void {
  const symbol = square.name.includes('Électricité') || square.name.includes('Electricite') ? '⚡' : '💧';
  drawSpecialCell(ctx, cell, square.name, symbol, '150€');
}

// ─── Taxe ────────────────────────────────────────────────────────────

function drawTaxCell(ctx: CanvasRenderingContext2D, cell: CellRect, square: TaxSquare): void {
  drawSpecialCell(ctx, cell, square.name, '💰', `${square.amount}€`);
}

// ─── Chance ──────────────────────────────────────────────────────────

function drawChanceCell(ctx: CanvasRenderingContext2D, cell: CellRect): void {
  const { x, y, w, h, side } = cell;

  // Fond Chance
  ctx.fillStyle = '#FFF8E1';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

  drawSpecialCell(ctx, cell, 'CHANCE', '?', '');
}

// ─── Caisse de Communaute ────────────────────────────────────────────

function drawCommunityCell(ctx: CanvasRenderingContext2D, cell: CellRect): void {
  ctx.fillStyle = '#E3F2FD';
  ctx.fillRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);

  drawSpecialCell(ctx, cell, 'CAISSE DE\nCOMMUNAUTÉ', '✉', '');
}

// ═══════════════════════════════════════════════════════════════════════
//  DESSIN — HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Dessiner une case speciale avec symbole, nom et prix.
 * Le texte est oriente vers l interieur du plateau.
 */
function drawSpecialCell(
  ctx: CanvasRenderingContext2D,
  cell: CellRect,
  name: string,
  symbol: string,
  price: string,
): void {
  const { x, y, w, h, side } = cell;
  const isVertical = side === 0 || side === 2;

  ctx.save();

  // Centrer et tourner selon le cote
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);

  // Rotation pour que le texte soit lisible depuis l interieur
  let rotation = 0;
  switch (side) {
    case 0: rotation = 0; break;         // Bas — texte normal
    case 1: rotation = Math.PI / 2; break;  // Gauche — tourner 90° horaire
    case 2: rotation = Math.PI; break;      // Haut — tourner 180°
    case 3: rotation = -Math.PI / 2; break; // Droite — tourner 90° anti-horaire
  }
  ctx.rotate(rotation);

  // Dimensions dans l espace local (toujours largeur=w, hauteur=h pour le bas)
  const localW = isVertical ? w : h;
  const localH = isVertical ? h : w;

  const symbolSize = Math.round(localW * 0.3);
  const nameSize = Math.round(localW * 0.095);
  const priceSize = Math.round(localW * 0.1);

  // Symbole
  ctx.font = `${symbolSize}px "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#333';
  ctx.fillText(symbol, 0, -localH * 0.15);

  // Nom (peut etre multi-ligne)
  ctx.fillStyle = '#222';
  ctx.font = `bold ${nameSize}px "Arial", sans-serif`;
  const lines = name.split('\n');
  const lineHeight = nameSize * 1.2;
  const startY = localH * 0.1 - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, 0, startY + i * lineHeight);
  }

  // Prix
  if (price) {
    ctx.fillStyle = '#555';
    ctx.font = `${priceSize}px "Arial", sans-serif`;
    ctx.fillText(price, 0, localH * 0.35);
  }

  ctx.restore();
}

/**
 * Dessiner le nom et le prix d une propriete de couleur,
 * correctement orientes selon le cote du plateau.
 */
function drawRotatedText(
  ctx: CanvasRenderingContext2D,
  cell: CellRect,
  name: string,
  price: string,
  stripH: number,
): void {
  const { x, y, w, h, side } = cell;
  const isVertical = side === 0 || side === 2;

  ctx.save();

  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);

  // Rotation
  let rotation = 0;
  switch (side) {
    case 0: rotation = 0; break;
    case 1: rotation = Math.PI / 2; break;
    case 2: rotation = Math.PI; break;
    case 3: rotation = -Math.PI / 2; break;
  }
  ctx.rotate(rotation);

  const localW = isVertical ? w : h;
  const localH = isVertical ? h : w;

  // Zone texte = sous le bandeau couleur
  const textZoneTop = -localH / 2 + stripH + 4;
  const textZoneH = localH - stripH - 8;
  const textCenterY = textZoneTop + textZoneH / 2;

  // Nom — avec retour a la ligne si necessaire
  const maxTextW = localW - 6;
  const nameSize = Math.round(localW * 0.09);
  ctx.fillStyle = '#222';
  ctx.font = `bold ${nameSize}px "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const wrappedName = wrapText(ctx, name, maxTextW);
  const lineH = nameSize * 1.15;
  const nameBlockH = wrappedName.length * lineH;
  const nameStartY = textCenterY - nameBlockH / 2 - 5;

  for (let i = 0; i < wrappedName.length; i++) {
    ctx.fillText(wrappedName[i]!, 0, nameStartY + i * lineH);
  }

  // Prix
  const priceSize = Math.round(localW * 0.12);
  ctx.fillStyle = '#444';
  ctx.font = `${priceSize}px "Arial", sans-serif`;
  ctx.fillText(price, 0, textCenterY + nameBlockH / 2 + 8);

  ctx.restore();
}

/**
 * Decouper un texte en lignes pour tenir dans maxWidth.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);

  // Si ca ne tient pas en 3 lignes, reduire
  if (lines.length > 3) {
    return [text.substring(0, 12) + '...'];
  }

  return lines;
}

// ─── Bordure exterieure ──────────────────────────────────────────────

function drawOuterBorder(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Bordure interieure (delimite le bord des cases du centre)
  const cornerPx = Math.round(TEX_SIZE * CORNER_FRAC);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(cornerPx, cornerPx, TEX_SIZE - 2 * cornerPx, TEX_SIZE - 2 * cornerPx);
}
