/**
 * EventBus — Infrastructure Layer
 *
 * Bus d'événements typé qui découple toutes les couches.
 * Chaque événement est défini dans GameEvents avec son payload exact.
 * Aucune dépendance externe.
 *
 * Usage :
 *   const bus = new EventBus();
 *   const unsub = bus.on('dice:rolled', (data) => { ... });
 *   bus.emit('dice:rolled', { values: [3, 4], isDouble: false });
 *   unsub(); // cleanup
 */

// ─── Types d'action UI ───────────────────────────────────────────────

export type ActionType =
  | 'roll-dice'
  | 'buy-property'
  | 'decline-property'
  | 'build-house'
  | 'end-turn'
  | 'pay-jail-fine'
  | 'use-jail-card';

export interface ActionContext {
  readonly playerId: string;
  readonly squareIndex?: number;
  readonly price?: number;
  readonly options?: readonly string[];
}

// ─── Catalogue complet des événements ────────────────────────────────

export interface GameEvents {
  // Tour de jeu
  'turn:started': { readonly playerId: string };
  'turn:ended': { readonly playerId: string };
  'dice:rolled': { readonly values: [number, number]; readonly isDouble: boolean };
  'pawn:moved': {
    readonly playerId: string;
    readonly from: number;
    readonly to: number;
    readonly steps: readonly number[];
  };

  // Actions de jeu
  'property:landed': { readonly playerId: string; readonly squareIndex: number };
  'property:bought': {
    readonly playerId: string;
    readonly squareIndex: number;
    readonly price: number;
  };
  'rent:paid': { readonly fromId: string; readonly toId: string; readonly amount: number };
  'card:drawn': { readonly type: 'chance' | 'community'; readonly cardId: number };
  'building:placed': {
    readonly squareIndex: number;
    readonly buildingType: 'house' | 'hotel';
    readonly count: number;
  };

  // Joueur
  'player:jailed': { readonly playerId: string };
  'player:released': { readonly playerId: string };
  'player:bankrupt': { readonly playerId: string };
  'player:balance:changed': {
    readonly playerId: string;
    readonly delta: number;
    readonly newBalance: number;
  };

  // UI
  'ui:action:required': { readonly type: ActionType; readonly context: ActionContext };
  'ui:notification': { readonly message: string; readonly level: 'info' | 'warn' | 'success' };

  // Jeu
  'game:started': { readonly playerIds: readonly string[] };
  'game:ended': { readonly winnerId: string };
}

// ─── Types internes ──────────────────────────────────────────────────

type EventName = keyof GameEvents;
type EventHandler<T extends EventName> = (data: GameEvents[T]) => void;
type Unsubscribe = () => void;

interface HandlerEntry<T extends EventName> {
  readonly handler: EventHandler<T>;
  readonly once: boolean;
}

// ─── EventBus ────────────────────────────────────────────────────────

export class EventBus {
  private readonly listeners = new Map<EventName, HandlerEntry<EventName>[]>();
  private readonly history: Array<{ event: EventName; data: unknown; timestamp: number }> = [];
  private readonly maxHistory: number;

  constructor(options?: { maxHistory?: number }) {
    this.maxHistory = options?.maxHistory ?? 200;
  }

  /**
   * S'abonner à un événement. Retourne une fonction de désinscription.
   */
  on<T extends EventName>(event: T, handler: EventHandler<T>): Unsubscribe {
    return this.addHandler(event, handler, false);
  }

  /**
   * S'abonner à un événement pour une seule émission.
   */
  once<T extends EventName>(event: T, handler: EventHandler<T>): Unsubscribe {
    return this.addHandler(event, handler, true);
  }

  /**
   * Émettre un événement avec son payload typé.
   */
  emit<T extends EventName>(event: T, data: GameEvents[T]): void {
    // Historique pour debug/replay
    this.history.push({ event, data, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const entries = this.listeners.get(event);
    if (!entries || entries.length === 0) return;

    // Copie pour éviter les problèmes si un handler se désinscrit pendant l'itération
    const snapshot = [...entries];

    for (const entry of snapshot) {
      try {
        (entry.handler as EventHandler<T>)(data);
      } catch (err: unknown) {
        console.error(`[EventBus] Erreur dans handler "${event}":`, err);
      }

      if (entry.once) {
        this.removeEntry(event, entry);
      }
    }
  }

  /**
   * Supprimer tous les handlers d'un événement, ou tous si aucun nom fourni.
   */
  off<T extends EventName>(event?: T): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Nombre de handlers enregistrés pour un événement.
   */
  listenerCount<T extends EventName>(event: T): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * Historique des événements émis (pour debug).
   */
  getHistory(): ReadonlyArray<{ event: EventName; data: unknown; timestamp: number }> {
    return this.history;
  }

  /**
   * Vider l'historique.
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * Reset complet (handlers + historique). Utile entre les parties.
   */
  reset(): void {
    this.listeners.clear();
    this.history.length = 0;
  }

  // ─── Privé ───────────────────────────────────────────────────────

  private addHandler<T extends EventName>(
    event: T,
    handler: EventHandler<T>,
    once: boolean,
  ): Unsubscribe {
    const entry: HandlerEntry<T> = { handler, once };

    let entries = this.listeners.get(event);
    if (!entries) {
      entries = [];
      this.listeners.set(event, entries);
    }
    entries.push(entry as HandlerEntry<EventName>);

    return () => {
      this.removeEntry(event, entry as HandlerEntry<EventName>);
    };
  }

  private removeEntry<T extends EventName>(event: T, entry: HandlerEntry<EventName>): void {
    const entries = this.listeners.get(event);
    if (!entries) return;

    const index = entries.indexOf(entry);
    if (index !== -1) {
      entries.splice(index, 1);
    }

    if (entries.length === 0) {
      this.listeners.delete(event);
    }
  }
}
