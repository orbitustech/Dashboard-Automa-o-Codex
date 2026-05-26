import { resolveVideoGeneration } from "../lib/gemini-video.mjs";
import { readJsonBody, requireOperatorAuth, sendJson, setCors } from "../lib/http.mjs";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Use POST." });
    return;
  }

  if (!(await requireOperatorAuth(req, res))) return;

  try {
    const body = await readJsonBody(req);
    const result = await resolveVideoGeneration(body);
    sendJson(res, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message
    });
  }
}
