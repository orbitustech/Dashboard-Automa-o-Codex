import { createCronContentDraft } from "../../lib/cron-content-drafts.mjs";
import { sendJson, setCors } from "../../lib/http.mjs";

function requireCron(req, res) {
  const expected = process.env.CRON_SECRET;
  const received = req.headers.authorization || "";
  if (!expected || received !== `Bearer ${expected}`) {
    sendJson(res, 401, { ok: false, error: "Unauthorized cron request." });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Use GET." });
    return;
  }
  if (!requireCron(req, res)) return;

  try {
    const result = await createCronContentDraft("18h");
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
}
