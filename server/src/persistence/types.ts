import type { KEvent } from '@kindra/shared';

export interface LoadedState {
  documents: Record<string, Record<string, unknown>>;
  events: KEvent[];
}

/**
 * Capa de persistencia enchufable. El servidor trabaja con el estado completo
 * en memoria y escribe a través de esta interfaz. Cambiar de "memory" a
 * "postgres" es solo configuración (2.3).
 */
export interface Persistence {
  readonly name: string;
  init(): Promise<void>;
  load(): Promise<LoadedState>;
  saveDocument(collection: string, id: string, doc: unknown): Promise<void>;
  deleteDocument(collection: string, id: string): Promise<void>;
  /** Solo inserta. Nunca actualiza ni borra (3.1). */
  appendEvent(event: KEvent): Promise<void>;
  /** Solo para el reinicio de datos de demostración (19.5). */
  clearAll(): Promise<void>;
  close(): Promise<void>;
}
