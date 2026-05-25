import { publishPendingTasks } from "../lib/buffer-publisher.mjs";
import { readJsonBody, requireOperatorAuth, sendJson, setCors } from "../lib/http.mjs";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!["GET", "POST"].includes(req.method)) {
    sendJson(res, 405, { ok: false, error: "Use GET ou POST." });
    return;
  }

  if (!(await requireOperatorAuth(req, res))) return;

  try {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const dryRun = req.query?.dry_run === "1" || body.dry_run === true || body.dry_run === "1";
    const limit = Number(req.query?.limit || body.limit || process.env.PUBLISH_LIMIT || 10);
    const result = await publishPendingTasks({ dryRun, limit });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message
    });
  }
}
