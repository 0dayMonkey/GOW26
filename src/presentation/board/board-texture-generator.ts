/**
 * BoardTextureGenerator — Presentation Layer
 *
 * FIX MIROIR (root cause) :
 * ──────────────────────────
 * La face TOP (+Y) du CreateBox de Babylon.js mappe les UV avec
 * U allant de +X vers −X (droite vers gauche en world space).
 * Quand on dessine normalement sur le canvas (gauche→droite = U croissant),
 * le texte apparait en miroir horizontal car U est inverse.
 *
 * Solution : on applique ctx.scale(-1, 1) + ctx.translate(-TEX_SIZE, 0)
 * au DEBUT du dessin. Tout le contenu est flippe horizontalement dans
 * le canvas, ce qui compense le flip U du mapping BJS. Le vScale=-1
 * dans le mesh-builder compense séparément le flip V (Canvas Y↓ vs UV V↑).
 *
 * [CERTAIN] API Babylon.js 7.x — DynamicTexture, face +Y UV mapping
 */

import { DynamicTexture, Scene, Texture } from '@babylonjs/core';
import { BOARD_SQUARES } from '@game-logic/board/board-definition';
import { SquareType, ColorGroup, type Square, type PropertySquare, type TaxSquare } from '@game-logic/types';
import { Logger } from '@infrastructure/logger';

const logger = Logger.create('BoardTextureGenerator');

const TEX_SIZE = 2048;
const CORNER_FRAC = 0.125;
const BORDER_W = 3;
const COLOR_STRIP_FRAC = 0.22;

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

const SPECIAL_BG: Partial<Record<SquareType, string>> = {
  [SquareType.CHANCE]:          '#FFF8E1',
  [SquareType.COMMUNITY_CHEST]: '#E3F2FD',
  [SquareType.TAX]:             '#F5F5F5',
  [SquareType.STATION]:         '#FAFAFA',
  [SquareType.UTILITY]:         '#FAFAFA',
};

const CORNER_BG: Record<number, string> = {
  0:  '#E8F5E9',
  10: '#FFF3E0',
  20: '#E8F5E9',
  30: '#FFEBEE',
};

interface CellRect {
  x: number; y: number; w: number; h: number;
  side: number; isCorner: boolean; squareIndex: number;
}

// ═══════════════════════════════════════════════════════════════════════

export function generateMonopolyBoardTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('board-texture', TEX_SIZE, scene, true);
  tex.hasAlpha = false;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;

  const ctx = tex.getContext() as CanvasRenderingContext2D;

  // ┌─────────────────────────────────────────────────────────────────┐
  // │ FIX MIROIR : flip horizontal du canvas pour compenser le       │
  // │ mapping UV de la face +Y du CreateBox BJS (U est inversé).     │
  // │ Sans ce flip, tout le texte apparait en miroir.                │
  // └─────────────────────────────────────────────────────────────────┘
  ctx.save();
  ctx.translate(TEX_SIZE, 0);
  ctx.scale(-1, 1);

  drawBackground(ctx);
  const cells = computeCellRects();
  for (const cell of cells) {
    const square = BOARD_SQUARES[cell.squareIndex]!;
    if (cell.isCorner) drawCornerCell(ctx, cell, square);
    else drawNormalCell(ctx, cell, square);
  }
  drawCenter(ctx);
  drawOuterBorder(ctx);

  ctx.restore();

  tex.update();
  logger.info('Texture plateau generee (2048x2048) — miroir corrige');
  return tex;
}

// ═══════════════════════════════════════════════════════════════════════
//  RECTANGLES
// ═══════════════════════════════════════════════════════════════════════

function computeCellRects(): CellRect[] {
  const cPx = Math.round(TEX_SIZE * CORNER_FRAC);
  const cellW = (TEX_SIZE - 2 * cPx) / 9;
  const cells: CellRect[] = [];

  for (let i = 0; i < 40; i++) {
    const side = Math.floor(i / 10);
    const idx = i % 10;
    const isCorner = idx === 0;
    let x = 0, y = 0, w = cPx, h = cPx;

    if (isCorner) {
      switch (side) {
        case 0: x = TEX_SIZE - cPx; y = TEX_SIZE - cPx; break;
        case 1: x = 0;              y = TEX_SIZE - cPx; break;
        case 2: x = 0;              y = 0;              break;
        case 3: x = TEX_SIZE - cPx; y = 0;              break;
      }
    } else {
      switch (side) {
        case 0:
          x = TEX_SIZE - cPx - idx * cellW;
          y = TEX_SIZE - cPx;
          w = cellW; h = cPx;
          break;
        case 1:
          x = 0;
          y = TEX_SIZE - cPx - idx * cellW;
          w = cPx; h = cellW;
          break;
        case 2:
          x = cPx + (idx - 1) * cellW;
          y = 0;
          w = cellW; h = cPx;
          break;
        case 3:
          x = TEX_SIZE - cPx;
          y = cPx + (idx - 1) * cellW;
          w = cPx; h = cellW;
          break;
      }
    }
    cells.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), side, isCorner, squareIndex: i });
  }
  return cells;
}

// ═══════════════════════════════════════════════════════════════════════
//  DESSIN
// ═══════════════════════════════════════════════════════════════════════

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#C8E6C0';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
}

function drawCenter(ctx: CanvasRenderingContext2D): void {
  const c = Math.round(TEX_SIZE * CORNER_FRAC);
  ctx.fillStyle = '#D4EDDA';
  ctx.fillRect(c + 10, c + 10, TEX_SIZE - 2 * c - 20, TEX_SIZE - 2 * c - 20);

  ctx.save();
  ctx.translate(TEX_SIZE / 2, TEX_SIZE / 2);
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#C41E3A';
  ctx.font = `bold ${Math.round(TEX_SIZE * 0.065)}px Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BUFFAPOLY', 0, -20);
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#333';
  ctx.font = `${Math.round(TEX_SIZE * 0.02)}px Georgia, serif`;
  ctx.fillText('Édition Française', 0, 30);
  ctx.strokeStyle = '#C41E3A'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-120, 55); ctx.lineTo(120, 55); ctx.stroke();
  ctx.restore();
}

function drawOuterBorder(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, TEX_SIZE, TEX_SIZE);
  const c = Math.round(TEX_SIZE * CORNER_FRAC);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  ctx.strokeRect(c, c, TEX_SIZE - 2 * c, TEX_SIZE - 2 * c);
}

function drawCornerCell(ctx: CanvasRenderingContext2D, cell: CellRect, _square: Square): void {
  const { x, y, w, h, squareIndex } = cell;
  ctx.fillStyle = CORNER_BG[squareIndex] ?? '#FFF';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#333'; ctx.lineWidth = BORDER_W;
  ctx.strokeRect(x, y, w, h);

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  let angle = 0;
  if (squareIndex === 0) angle = -Math.PI / 4;
  if (squareIndex === 10) angle = Math.PI / 4;
  if (squareIndex === 20) angle = -Math.PI / 4;
  if (squareIndex === 30) angle = Math.PI / 4;
  ctx.rotate(angle);

  const fs = Math.round(w * 0.14);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  switch (squareIndex) {
    case 0:
      ctx.fillStyle = '#D32F2F'; ctx.font = `bold ${fs}px Arial`;
      ctx.fillText('DÉPART', 0, -15);
      ctx.fillStyle = '#333'; ctx.font = `${Math.round(fs * 0.65)}px Arial`;
      ctx.fillText('Recevez 200€', 0, 15);
      ctx.fillStyle = '#D32F2F'; ctx.font = `${Math.round(fs * 1.2)}px Arial`;
      ctx.fillText('→', 0, 45);
      break;
    case 10:
      ctx.fillStyle = '#E65100'; ctx.font = `bold ${fs}px Arial`;
      ctx.fillText('PRISON', 0, -15);
      ctx.fillStyle = '#555'; ctx.font = `${Math.round(fs * 0.6)}px Arial`;
      ctx.fillText('Simple visite', 0, 15);
      break;
    case 20:
      ctx.fillStyle = '#2E7D32'; ctx.font = `bold ${fs * 0.9}px Arial`;
      ctx.fillText('PARC', 0, -15); ctx.fillText('GRATUIT', 0, 15);
      break;
    case 30:
      ctx.fillStyle = '#1A237E'; ctx.font = `bold ${fs * 0.85}px Arial`;
      ctx.fillText('ALLEZ EN', 0, -12); ctx.fillText('PRISON', 0, 18);
      break;
  }
  ctx.restore();
}

function drawNormalCell(ctx: CanvasRenderingContext2D, cell: CellRect, square: Square): void {
  const { x, y, w, h } = cell;
  ctx.fillStyle = SPECIAL_BG[square.type] ?? '#FFFFF5';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#333'; ctx.lineWidth = BORDER_W;
  ctx.strokeRect(x, y, w, h);

  if (square.type === SquareType.PROPERTY) drawPropertyCell(ctx, cell, square as PropertySquare);
  else if (square.type === SquareType.STATION) drawIconCell(ctx, cell, square.name, '🚂', '200€');
  else if (square.type === SquareType.UTILITY) {
    const sym = square.name.includes('lectricit') ? '⚡' : '💧';
    drawIconCell(ctx, cell, square.name, sym, '150€');
  }
  else if (square.type === SquareType.TAX) drawIconCell(ctx, cell, square.name, '💰', `${(square as TaxSquare).amount}€`);
  else if (square.type === SquareType.CHANCE) drawIconCell(ctx, cell, 'CHANCE', '?', '');
  else if (square.type === SquareType.COMMUNITY_CHEST) drawIconCell(ctx, cell, 'CAISSE DE\nCOMMUNAUTÉ', '✉', '');
}

function drawPropertyCell(ctx: CanvasRenderingContext2D, cell: CellRect, sq: PropertySquare): void {
  const { x, y, w, h, side } = cell;
  const isVert = side === 0 || side === 2;
  const color = GROUP_CSS[sq.color] ?? '#999';
  const stripH = Math.round((isVert ? h : w) * COLOR_STRIP_FRAC);

  ctx.fillStyle = color;
  switch (side) {
    case 0: ctx.fillRect(x + 2, y + 2, w - 4, stripH); break;
    case 1: ctx.fillRect(x + w - stripH - 2, y + 2, stripH, h - 4); break;
    case 2: ctx.fillRect(x + 2, y + h - stripH - 2, w - 4, stripH); break;
    case 3: ctx.fillRect(x + 2, y + 2, stripH, h - 4); break;
  }
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  switch (side) {
    case 0: ctx.strokeRect(x + 2, y + 2, w - 4, stripH); break;
    case 1: ctx.strokeRect(x + w - stripH - 2, y + 2, stripH, h - 4); break;
    case 2: ctx.strokeRect(x + 2, y + h - stripH - 2, w - 4, stripH); break;
    case 3: ctx.strokeRect(x + 2, y + 2, stripH, h - 4); break;
  }

  drawCellText(ctx, cell, sq.name, `${sq.price}€`, stripH);
}

function drawIconCell(ctx: CanvasRenderingContext2D, cell: CellRect, name: string, icon: string, price: string): void {
  const { x, y, w, h, side } = cell;
  const isVert = side === 0 || side === 2;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][side] ?? 0;
  ctx.rotate(rot);

  const lW = isVert ? w : h;
  const lH = isVert ? h : w;

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(lW * 0.3)}px Arial`; ctx.fillStyle = '#333';
  ctx.fillText(icon, 0, -lH * 0.15);

  ctx.fillStyle = '#222'; ctx.font = `bold ${Math.round(lW * 0.09)}px Arial`;
  const lines = name.split('\n');
  const lh = Math.round(lW * 0.09) * 1.2;
  const startY = lH * 0.1 - ((lines.length - 1) * lh) / 2;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i]!, 0, startY + i * lh);

  if (price) { ctx.fillStyle = '#555'; ctx.font = `${Math.round(lW * 0.1)}px Arial`; ctx.fillText(price, 0, lH * 0.35); }
  ctx.restore();
}

function drawCellText(ctx: CanvasRenderingContext2D, cell: CellRect, name: string, price: string, stripH: number): void {
  const { x, y, w, h, side } = cell;
  const isVert = side === 0 || side === 2;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][side] ?? 0;
  ctx.rotate(rot);

  const lW = isVert ? w : h;
  const lH = isVert ? h : w;
  const nameSize = Math.round(lW * 0.09);

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#222'; ctx.font = `bold ${nameSize}px Arial`;

  const wrapped = wrapText(ctx, name, lW - 6);
  const lineH = nameSize * 1.15;
  const blockH = wrapped.length * lineH;
  const zone = -lH / 2 + stripH + 4;
  const zoneH = lH - stripH - 8;
  const center = zone + zoneH / 2;
  const nameY = center - blockH / 2 - 5;

  for (let i = 0; i < wrapped.length; i++) ctx.fillText(wrapped[i]!, 0, nameY + i * lineH);

  ctx.fillStyle = '#444'; ctx.font = `${Math.round(lW * 0.12)}px Arial`;
  ctx.fillText(price, 0, center + blockH / 2 + 8);
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length > 3 ? [text.substring(0, 14) + '…'] : lines;
}
