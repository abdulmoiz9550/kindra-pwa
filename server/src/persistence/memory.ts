import fs from 'node:fs';
import path from 'node:path';
import type { KEvent } from '@kindra/shared';
import type { Persistence, LoadedState } from './types';

/**
 * Persistencia en memoria con volcado opcional a un archivo JSON (debounced).
 * Es el modo de pruebas del frontend: no requiere base de datos.
 */
export class MemoryPersistence implements Persistence {
  readonly name = 'memory';
  private documents: Record<string, Record<string, unknown>> = {};
  private events: KEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(private readonly filePath: string | null) {}

  async init(): Promise<void> {
    if (this.filePath) fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  async load(): Promise<LoadedState> {
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as LoadedState;
        this.documents = raw.documents || {};
        this.events = raw.events || [];
      } catch (err) {
        console.warn('[persistence] no se pudo leer el archivo de estado, se parte de cero:', (err as Error).message);
      }
    }
    return { documents: this.documents, events: this.events };
  }

  async saveDocument(collection: string, id: string, doc: unknown): Promise<void> {
    (this.documents[collection] ||= {})[id] = doc;
    this.schedule();
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    if (this.documents[collection]) delete this.documents[collection][id];
    this.schedule();
  }

  async appendEvent(event: KEvent): Promise<void> {
    this.events.push(event);
    this.schedule();
  }

  async clearAll(): Promise<void> {
    this.documents = {};
    this.events = [];
    this.schedule();
  }

  async close(): Promise<void> {
    this.flush();
  }

  flush(): void {
    if (!this.filePath || !this.dirty) return;
    this.dirty = false;
    try {
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ documents: this.documents, events: this.events }));
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn('[persistence] error al guardar el archivo de estado:', (err as Error).message);
    }
  }

  private schedule(): void {
    this.dirty = true;
    if (!this.filePath) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 800);
  }
}
