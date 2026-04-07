/**
 * Logger — Infrastructure Layer
 *
 * Logger structuré avec niveaux, préfixes et timestamps.
 * Aucune dépendance externe.
 *
 * Usage :
 *   const logger = Logger.create('GameLogic');
 *   logger.info('Partie démarrée', { players: 4 });
 *   logger.warn('Solde bas', { balance: 50 });
 *   logger.error('État invalide', { phase: 'ROLLING' });
 *
 * Configuration globale :
 *   Logger.setLevel(LogLevel.WARN);  // masque info/debug en prod
 *   Logger.setEnabled(false);        // silence total
 */

// ─── Types ───────────────────────────────────────────────────────────

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

interface LogEntry {
  readonly level: LogLevel;
  readonly prefix: string;
  readonly message: string;
  readonly data?: unknown;
  readonly timestamp: number;
}

type LogOutput = (entry: LogEntry) => void;

// ─── Configuration globale ───────────────────────────────────────────

let globalLevel: LogLevel = LogLevel.DEBUG;
let globalEnabled = true;
let globalOutput: LogOutput = defaultOutput;

function defaultOutput(entry: LogEntry): void {
  const time = new Date(entry.timestamp).toISOString().slice(11, 23);
  const tag = `[${time}][${entry.prefix}]`;
  const args: unknown[] = [tag, entry.message];
  if (entry.data !== undefined) args.push(entry.data);

  switch (entry.level) {
    case LogLevel.DEBUG:
      // eslint-disable-next-line no-console
      console.debug(...args);
      break;
    case LogLevel.INFO:
      // eslint-disable-next-line no-console
      console.info(...args);
      break;
    case LogLevel.WARN:
      console.warn(...args);
      break;
    case LogLevel.ERROR:
      console.error(...args);
      break;
    default:
      break;
  }
}

// ─── Logger ──────────────────────────────────────────────────────────

export class Logger {
  private readonly prefix: string;

  private constructor(prefix: string) {
    this.prefix = prefix;
  }

  /**
   * Créer un logger avec un préfixe (typiquement le nom du module/couche).
   */
  static create(prefix: string): Logger {
    return new Logger(prefix);
  }

  /**
   * Définir le niveau minimum global (les niveaux inférieurs sont ignorés).
   */
  static setLevel(level: LogLevel): void {
    globalLevel = level;
  }

  /**
   * Activer/désactiver tous les logs globalement.
   */
  static setEnabled(enabled: boolean): void {
    globalEnabled = enabled;
  }

  /**
   * Remplacer la sortie par défaut (utile pour les tests).
   */
  static setOutput(output: LogOutput): void {
    globalOutput = output;
  }

  /**
   * Restaurer la sortie console par défaut.
   */
  static resetOutput(): void {
    globalOutput = defaultOutput;
  }

  /**
   * Obtenir le niveau actuel.
   */
  static getLevel(): LogLevel {
    return globalLevel;
  }

  // ─── Méthodes de log ────────────────────────────────────────────

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data);
  }

  // ─── Privé ──────────────────────────────────────────────────────

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!globalEnabled) return;
    if (level < globalLevel) return;

    const entry: LogEntry = {
      level,
      prefix: this.prefix,
      message,
      data,
      timestamp: Date.now(),
    };

    try {
      globalOutput(entry);
    } catch {
      // Fail silently — le logger ne doit jamais crasher l'app
    }
  }
}
