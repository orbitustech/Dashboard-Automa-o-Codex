import { createCronVideoDraft } from "../lib/cron-video-drafts.mjs";
import { readJsonBody, requireOperatorAuth, sendJson, setCors } from "../lib/http.mjs";

function requestedSlot(body = {}) {
  const raw = String(body.slot || body.time || body.target || "").toLowerCase();
  return raw.includes("18") ? "18h" : "14h";
}

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
    const result = await createCronVideoDraft(requestedSlot(body));
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message
    });
  }
}
