import { Router } from 'express';
import { z } from 'zod';
import { requireRole, wrap } from '../middleware/auth';
import { db } from '../core/db';
import { forbidden } from '../core/errors';
import { decideSuggestion, suggestFromPhoto } from '../services/ai';

/** Sugerencias de IA sobre fotos de carga (v4.0, sección 8). Solo quien clasifica en el centro. */
export const aiRouter = Router();
aiRouter.use(requireRole('center'));

aiRouter.post(
  '/photo',
  wrap(async (req, res) => {
    const { photoId } = z.object({ photoId: z.string() }).parse(req.body);
    // Solo fotos de cargas de su propio centro o que esa persona acaba de subir.
    const photo = db().get('photos', photoId);
    const own = !!photo && (photo.uploadedBy === req.auth!.user.id || db().filter('trips', (t) => t.centerId === req.auth!.user.centerId).some((t) => t.arrival?.photoId === photoId || t.departure.photoId === photoId));
    if (!own) throw forbidden('Solo puedes analizar fotos de cargas de tu centro.');
    res.status(201).json(await suggestFromPhoto(req.auth!.actor, photoId));
  }),
);

aiRouter.post(
  '/photo/:id/decision',
  wrap((req, res) => {
    const { final } = z.object({ final: z.enum(['concrete_brick', 'wood', 'metal', 'mixed', 'possible_hazardous']).nullable() }).parse(req.body);
    const s = db().get('aiSuggestions', String(req.params.id));
    if (s && s.requestedBy !== req.auth!.user.id) throw forbidden('La decisión es de quien pidió la sugerencia.');
    res.json(decideSuggestion(req.auth!.actor, String(req.params.id), final));
  }),
);
