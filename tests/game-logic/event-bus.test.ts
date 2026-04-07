/**
 * Tests — EventBus
 *
 * Couverture : on, once, emit, off, listenerCount,
 * history, reset, error isolation, unsubscribe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../src/infrastructure/event-bus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  // ─── on / emit ───────────────────────────────────────────────────

  describe('on + emit', () => {
    it('appelle le handler avec le bon payload', () => {
      const handler = vi.fn();
      bus.on('dice:rolled', handler);

      bus.emit('dice:rolled', { values: [3, 4], isDouble: false });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ values: [3, 4], isDouble: false });
    });

    it('appelle plusieurs handlers dans l'ordre d'inscription', () => {
      const order: number[] = [];
      bus.on('turn:started', () => order.push(1));
      bus.on('turn:started', () => order.push(2));
      bus.on('turn:started', () => order.push(3));

      bus.emit('turn:started', { playerId: 'p1' });

      expect(order).toEqual([1, 2, 3]);
    });

    it('n'appelle pas les handlers d'un autre événement', () => {
      const handler = vi.fn();
      bus.on('turn:started', handler);

      bus.emit('turn:ended', { playerId: 'p1' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('ne crashe pas si aucun handler enregistré', () => {
      expect(() => {
        bus.emit('game:started', { playerIds: ['p1', 'p2'] });
      }).not.toThrow();
    });
  });

  // ─── once ────────────────────────────────────────────────────────

  describe('once', () => {
    it('appelle le handler une seule fois', () => {
      const handler = vi.fn();
      bus.once('dice:rolled', handler);

      bus.emit('dice:rolled', { values: [1, 1], isDouble: true });
      bus.emit('dice:rolled', { values: [2, 3], isDouble: false });

      expect(handler).toHaveBeenCalledOnce();
    });

    it('peut être désinscrit avant émission', () => {
      const handler = vi.fn();
      const unsub = bus.once('dice:rolled', handler);

      unsub();
      bus.emit('dice:rolled', { values: [1, 2], isDouble: false });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── unsubscribe ─────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('la fonction retournée par on() désinscrit le handler', () => {
      const handler = vi.fn();
      const unsub = bus.on('turn:started', handler);

      unsub();
      bus.emit('turn:started', { playerId: 'p1' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('ne désinscrit que le handler concerné', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const unsub1 = bus.on('turn:started', handler1);
      bus.on('turn:started', handler2);

      unsub1();
      bus.emit('turn:started', { playerId: 'p1' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('appeler unsub deux fois ne crashe pas', () => {
      const handler = vi.fn();
      const unsub = bus.on('turn:started', handler);

      unsub();
      expect(() => unsub()).not.toThrow();
    });
  });

  // ─── off ─────────────────────────────────────────────────────────

  describe('off', () => {
    it('supprime tous les handlers d'un événement', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.on('dice:rolled', h1);
      bus.on('dice:rolled', h2);

      bus.off('dice:rolled');
      bus.emit('dice:rolled', { values: [5, 6], isDouble: false });

      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });

    it('sans argument supprime TOUS les handlers', () => {
      bus.on('dice:rolled', vi.fn());
      bus.on('turn:started', vi.fn());
      bus.on('game:ended', vi.fn());

      bus.off();

      expect(bus.listenerCount('dice:rolled')).toBe(0);
      expect(bus.listenerCount('turn:started')).toBe(0);
      expect(bus.listenerCount('game:ended')).toBe(0);
    });
  });

  // ─── listenerCount ───────────────────────────────────────────────

  describe('listenerCount', () => {
    it('retourne 0 sans handlers', () => {
      expect(bus.listenerCount('dice:rolled')).toBe(0);
    });

    it('retourne le bon nombre', () => {
      bus.on('dice:rolled', vi.fn());
      bus.on('dice:rolled', vi.fn());

      expect(bus.listenerCount('dice:rolled')).toBe(2);
    });

    it('décompte après unsubscribe', () => {
      const unsub = bus.on('dice:rolled', vi.fn());
      bus.on('dice:rolled', vi.fn());

      unsub();

      expect(bus.listenerCount('dice:rolled')).toBe(1);
    });
  });

  // ─── history ─────────────────────────────────────────────────────

  describe('history', () => {
    it('enregistre les événements émis', () => {
      bus.emit('game:started', { playerIds: ['p1', 'p2'] });
      bus.emit('turn:started', { playerId: 'p1' });

      const history = bus.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]!.event).toBe('game:started');
      expect(history[1]!.event).toBe('turn:started');
    });

    it('respecte la limite maxHistory', () => {
      const smallBus = new EventBus({ maxHistory: 3 });

      smallBus.emit('turn:started', { playerId: 'p1' });
      smallBus.emit('turn:started', { playerId: 'p2' });
      smallBus.emit('turn:started', { playerId: 'p3' });
      smallBus.emit('turn:started', { playerId: 'p4' });

      const history = smallBus.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0]!.event).toBe('turn:started');
    });

    it('clearHistory vide l'historique', () => {
      bus.emit('turn:started', { playerId: 'p1' });
      bus.clearHistory();

      expect(bus.getHistory()).toHaveLength(0);
    });
  });

  // ─── reset ───────────────────────────────────────────────────────

  describe('reset', () => {
    it('supprime handlers ET historique', () => {
      bus.on('dice:rolled', vi.fn());
      bus.emit('dice:rolled', { values: [1, 2], isDouble: false });

      bus.reset();

      expect(bus.listenerCount('dice:rolled')).toBe(0);
      expect(bus.getHistory()).toHaveLength(0);
    });
  });

  // ─── Error isolation ─────────────────────────────────────────────

  describe('error isolation', () => {
    it('un handler qui throw n'empêche pas les autres', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler1 = vi.fn(() => {
        throw new Error('boom');
      });
      const handler2 = vi.fn();

      bus.on('turn:started', handler1);
      bus.on('turn:started', handler2);

      bus.emit('turn:started', { playerId: 'p1' });

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledOnce();

      errorSpy.mockRestore();
    });
  });
});
