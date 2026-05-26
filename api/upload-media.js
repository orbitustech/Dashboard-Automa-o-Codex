import { requireOperatorAuth, sendJson, setCors } from "../lib/http.mjs";
import { parseMultipartFile } from "../lib/multipart.mjs";
import { uploadPublicMedia } from "../lib/storage-upload.mjs";

export const config = {
  api: {
    bodyParser: false
  }
};

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
    const file = await parseMultipartFile(req, { limitBytes: Number(process.env.KOINOPS_UPLOAD_MAX_BYTES || 80 * 1024 * 1024) });
    const uploaded = await uploadPublicMedia(file);
    sendJson(res, 200, {
      ok: true,
      media: uploaded
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: error.message
    });
  }
}
