import type {
  Entity, User, Sector, Origin, VehicleType, Vehicle, Trip, Center, Reception, Batch, HazardDecision,
  QualityVerification, Work, Dispatch, Closure, DailySummary, JobsRecord, Observation, Lesson, LessonCompletion,
  MonitorRequest, Alert, Photo, Notification, AuraTextEntry, PreregistrationCode, KEvent, AppConfig, Space,
} from '@kindra/shared';
import type { Persistence } from '../persistence/types';

export interface AuraSession {
  id: string;
  userId?: string | null;
  step: string;
  draft: Record<string, unknown>;
  contextCode?: string | null;
  name?: string | null;
  createdAt: string;
  updatedAt: string;
  lastVariant: Record<string, number>;
  history: { role: 'user' | 'aura'; text: string; at: string; photoUrl?: string | null }[];
}

export interface Certificate {
  id: string;
  code: string;
  userId: string;
  alias: string;
  levelKey: string;
  levelName: string;
  closedReports: number;
  issuedAt: string;
}

export interface TwoFactorSecret {
  id: string; // userId
  secret: string | null;
  pendingSecret: string | null;
  updatedAt: string;
}

export interface Collections {
  entities: Entity;
  users: User;
  sectors: Sector;
  centers: Center;
  vehicleTypes: VehicleType;
  vehicles: Vehicle;
  lessons: Lesson;
  auraTexts: AuraTextEntry;
  config: AppConfig;
  photos: Photo;
  preregistrationCodes: PreregistrationCode;
  notifications: Notification;
  auraSessions: AuraSession;
  certificates: Certificate;
  spaces: Space;
  /** Secretos de verificación en dos pasos (nunca salen del servidor). */
  twoFactorSecrets: TwoFactorSecret;
  // Proyecciones derivadas de eventos
  origins: Origin;
  trips: Trip;
  receptions: Reception;
  batches: Batch;
  hazardDecisions: HazardDecision;
  qualityVerifications: QualityVerification;
  works: Work;
  dispatches: Dispatch;
  closures: Closure;
  dailySummaries: DailySummary;
  jobs: JobsRecord;
  observations: Observation;
  lessonCompletions: LessonCompletion;
  monitorRequests: MonitorRequest;
  alerts: Alert;
}

export type CollectionName = keyof Collections;

/** Colecciones que se reconstruyen reproduciendo la bitácora. */
export const PROJECTION_COLLECTIONS: CollectionName[] = [
  'origins', 'trips', 'receptions', 'batches', 'hazardDecisions', 'qualityVerifications', 'works', 'dispatches',
  'closures', 'dailySummaries', 'jobs', 'observations', 'lessonCompletions', 'monitorRequests', 'alerts',
];

const ALL_COLLECTIONS: CollectionName[] = [
  'entities', 'users', 'sectors', 'centers', 'vehicleTypes', 'vehicles', 'lessons', 'auraTexts', 'config', 'photos',
  'preregistrationCodes', 'notifications', 'auraSessions', 'certificates', 'spaces', 'twoFactorSecrets', ...PROJECTION_COLLECTIONS,
];

/**
 * Estado completo en memoria con escritura directa a la persistencia.
 * Las lecturas son síncronas; las escrituras se encolan en orden.
 */
export class Db {
  private data = new Map<CollectionName, Map<string, unknown>>();
  private events: KEvent[] = [];
  private eventsById = new Map<string, KEvent>();
  private eventsByChain = new Map<string, KEvent[]>();
  private writeQueue: Promise<void> = Promise.resolve();
  private persistEnabled = true;

  constructor(public readonly persistence: Persistence) {
    for (const c of ALL_COLLECTIONS) this.data.set(c, new Map());
  }

  async load(): Promise<void> {
    const state = await this.persistence.load();
    for (const c of ALL_COLLECTIONS) {
      const docs = state.documents[c] || {};
      const map = new Map<string, unknown>();
      for (const [id, doc] of Object.entries(docs)) map.set(id, doc);
      this.data.set(c, map);
    }
    this.events = [...state.events].sort((a, b) => a.seq - b.seq);
    this.rebuildEventIndexes();
  }

  private rebuildEventIndexes(): void {
    this.eventsById.clear();
    this.eventsByChain.clear();
    for (const e of this.events) {
      this.eventsById.set(e.id, e);
      const arr = this.eventsByChain.get(e.chainId) || [];
      arr.push(e);
      this.eventsByChain.set(e.chainId, arr);
    }
  }

  // ---------- documentos ----------
  get<K extends CollectionName>(col: K, id: string): Collections[K] | undefined {
    return this.data.get(col)!.get(id) as Collections[K] | undefined;
  }

  list<K extends CollectionName>(col: K): Collections[K][] {
    return [...this.data.get(col)!.values()] as Collections[K][];
  }

  find<K extends CollectionName>(col: K, pred: (d: Collections[K]) => boolean): Collections[K] | undefined {
    for (const d of this.data.get(col)!.values()) if (pred(d as Collections[K])) return d as Collections[K];
    return undefined;
  }

  filter<K extends CollectionName>(col: K, pred: (d: Collections[K]) => boolean): Collections[K][] {
    const out: Collections[K][] = [];
    for (const d of this.data.get(col)!.values()) if (pred(d as Collections[K])) out.push(d as Collections[K]);
    return out;
  }

  count<K extends CollectionName>(col: K): number {
    return this.data.get(col)!.size;
  }

  put<K extends CollectionName>(col: K, doc: Collections[K] & { id?: string; code?: string }): Collections[K] {
    const id = (doc as { id?: string }).id ?? (doc as { code?: string }).code;
    if (!id) throw new Error(`Documento sin id en ${col}`);
    this.data.get(col)!.set(id, doc);
    this.enqueue(() => this.persistence.saveDocument(col, id, doc));
    return doc;
  }

  update<K extends CollectionName>(col: K, id: string, patch: Partial<Collections[K]>): Collections[K] {
    const current = this.get(col, id);
    if (!current) throw new Error(`No existe ${col}/${id}`);
    const next = { ...current, ...patch } as Collections[K];
    this.data.get(col)!.set(id, next);
    this.enqueue(() => this.persistence.saveDocument(col, id, next));
    return next;
  }

  remove(col: CollectionName, id: string): void {
    this.data.get(col)!.delete(id);
    this.enqueue(() => this.persistence.deleteDocument(col, id));
  }

  clearCollection(col: CollectionName): void {
    this.data.get(col)!.clear();
  }

  // ---------- eventos ----------
  allEvents(): KEvent[] {
    return this.events;
  }

  eventsOfChain(chainId: string): KEvent[] {
    return this.eventsByChain.get(chainId) || [];
  }

  lastEventOfChain(chainId: string): KEvent | undefined {
    const arr = this.eventsByChain.get(chainId);
    return arr && arr.length ? arr[arr.length - 1] : undefined;
  }

  eventById(id: string): KEvent | undefined {
    return this.eventsById.get(id);
  }

  nextSeq(): number {
    return this.events.length ? this.events[this.events.length - 1].seq + 1 : 1;
  }

  /** Solo anexa. No existe ningún método para modificar o borrar eventos. */
  appendEvent(e: KEvent): void {
    this.events.push(e);
    this.eventsById.set(e.id, e);
    const arr = this.eventsByChain.get(e.chainId) || [];
    arr.push(e);
    this.eventsByChain.set(e.chainId, arr);
    this.enqueue(() => this.persistence.appendEvent(e));
  }

  /** Reinicio total: solo lo usa el reset de datos de demostración (19.5). */
  async resetAll(): Promise<void> {
    await this.writeQueue;
    for (const c of ALL_COLLECTIONS) this.data.get(c)!.clear();
    this.events = [];
    this.rebuildEventIndexes();
    await this.persistence.clearAll();
  }

  /** Permite importar eventos ya sellados (p. ej. semilla) sin re-persistir uno a uno. */
  setPersistEnabled(enabled: boolean): void {
    this.persistEnabled = enabled;
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private enqueue(op: () => Promise<void>): void {
    if (!this.persistEnabled) return;
    this.writeQueue = this.writeQueue.then(op).catch((err) => {
      console.error('[persistence] error de escritura:', (err as Error).message);
    });
  }
}

let instance: Db | null = null;
export function setDb(db: Db): void {
  instance = db;
}
export function db(): Db {
  if (!instance) throw new Error('Db no inicializada');
  return instance;
}
