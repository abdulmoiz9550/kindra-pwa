import { env } from '../config/env';

/** Cliente mínimo de Gemini (REST). La clave viaja en una cabecera, nunca en la URL ni en los registros. */
export class GeminiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GeminiRequest {
  system: string;
  parts: GeminiPart[];
  maxOutputTokens: number;
  /** Esquema de respuesta: si se indica, la respuesta es JSON. */
  schema?: Record<string, unknown>;
  timeoutMs?: number;
}

interface GeminiResponse {
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}

export const geminiReady = () => !!env.geminiApiKey;

export async function askGemini(req: GeminiRequest): Promise<{ text: string; model: string; finished: boolean }> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
      signal: AbortSignal.timeout(req.timeoutMs ?? 20_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: req.parts }],
        generationConfig: { maxOutputTokens: req.maxOutputTokens, thinkingConfig: { thinkingBudget: 0 }, ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema } : {}) },
      }),
    });
  } catch (err) {
    throw new GeminiError(0, (err as Error).message);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new GeminiError(res.status, body?.error?.message || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as GeminiResponse;
  const c = data.candidates?.[0];
  const text = (c?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  return { text, model: data.modelVersion || env.geminiModel, finished: c?.finishReason === 'STOP' && !data.promptFeedback?.blockReason };
}
