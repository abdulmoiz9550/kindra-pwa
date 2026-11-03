export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'error',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'Necesitas iniciar sesión para hacer esto.') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'Tu rol no permite esta acción.') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'No se encontró lo que buscas.') => new HttpError(404, msg, 'not_found');
export const conflict = (msg: string, code = 'rule_blocked', details?: unknown) => new HttpError(409, msg, code, details);
