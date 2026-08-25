const DEFAULT_SUPABASE_URL = "https://nbbprjduqtndkwbknyud.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_q4AiMHgZ-zx-88KMCRiNFg_OpztyQZv";
const DEFAULT_GRAPH_VERSION = "v24.0";

function envValue(name, fallback = "") {
  return process.env[name] || fallback;
}

function cleanAccountRef(value) {
  return String(value || "").trim();
}

function platformKey(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (text.includes("instagram")) return "instagram";
  if (text.includes("threads")) return "threads";
  if (text.includes("facebook") || text === "fb") return "facebook";
  if (text.includes("tiktok")) return "tiktok";
  if (text.includes("linkedin")) return "linkedin";
  if (text === "x" || text.includes("twitter")) return "x";
  return text.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function socialUtmSource(channel) {
  return String(channel || "social")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "social";
}

function contentTargetChannels(content) {
  const raw = String(content?.channel || "").trim();
  if (!raw || /^(todas|todos|all|social|multicanal)$/i.test(raw)) return [];
  return raw
    .split(/[,;/|]+/)
    .map((item) => socialUtmSource(item))
    .filter(Boolean);
}

function contentMatchesSocial(content, social) {
  const targets = contentTargetChannels(content);
  return !targets.length || targets.includes(socialUtmSource(social.channel));
}

function buildUtmUrl(baseUrl, source, medium, campaign) {
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    if (source) url.searchParams.set("utm_source", source);
    if (medium) url.searchParams.set("utm_medium", medium);
    if (campaign) url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function campaignNameFor(content) {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `pesquisa_premios_${date.getFullYear()}_${month}_${socialUtmSource(content?.site_id || "site")}`;
}

function resolveConfig(options = {}) {
  return {
    supabaseUrl: options.supabaseUrl || envValue("SUPABASE_URL", DEFAULT_SUPABASE_URL),
    supabaseKey: options.supabaseKey || envValue("SUPABASE_SERVICE_ROLE_KEY") || envValue("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_KEY),
    limit: Number(options.limit || envValue("PUBLISH_LIMIT", "10")),
    dryRun: Boolean(options.dryRun ?? envValue("DRY_RUN") === "1"),
    publishMode: options.publishMode === "now" ? "now" : "queue",
    taskIds: Array.isArray(options.taskIds) ? options.taskIds.filter(Boolean) : [],
    contentId: options.contentId || "",
    graphVersion: envValue("META_GRAPH_VERSION", DEFAULT_GRAPH_VERSION),
    linkedinVersion: envValue("LINKEDIN_VERSION", "202606")
  };
}

async function supabase(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = payload.error?.message || payload.message || JSON.stringify(payload);
    throw new Error(`${response.status}: ${detail}`);
  }
  return payload;
}

function textWithLink(content, task) {
  return [content?.body || content?.title || task.note, task.utm_url]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function isVideoMedia(url, contentType = "") {
  return /\.(mp4|mov|m4v|webm)(?:\?|$)/i.test(String(url || "")) || /^video\//i.test(contentType);
}

function requireToken(name) {
  const token = process.env[name];
  if (!token) throw new Error(`${name} nao configurado no backend.`);
  return token;
}

function isTaskDue(config, task) {
  if (config.publishMode === "now") return true;
  const raw = task.scheduled_for;
  if (!raw) return true;
  const due = new Date(raw).getTime();
  return Number.isFinite(due) && due <= Date.now();
}

function accountRef(task, fallbackEnv) {
  const ref = cleanAccountRef(task.buffer_channel_id);
  return ref || process.env[fallbackEnv] || "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContainerReady({ base, accessToken, creationId, attempts = 10, intervalMs = 3000 }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await requestJson(
      `${base}/${encodeURIComponent(creationId)}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
      { method: "GET" }
    );
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR") throw new Error("Instagram falhou ao processar a midia enviada.");
    await wait(intervalMs);
  }
  throw new Error("Instagram ainda esta processando o video apos o tempo limite. A tarefa ficara com erro; use Reenviar para tentar de novo.");
}

async function publishInstagram({ config, task, content }) {
  const accessToken = requireToken("INSTAGRAM_ACCESS_TOKEN");
  const igUserId = accountRef(task, "INSTAGRAM_USER_ID");
  if (!igUserId) throw new Error("Instagram precisa do IG User ID no campo ID oficial/API ou em INSTAGRAM_USER_ID.");
  if (!content?.asset_url) throw new Error("Instagram exige uma URL publica de imagem ou video.");

  const mediaParams = new URLSearchParams({
    access_token: accessToken,
    caption: textWithLink(content, task)
  });
  const isVideo = isVideoMedia(content.asset_url);
  if (isVideo) {
    mediaParams.set("media_type", "REELS");
    mediaParams.set("video_url", content.asset_url);
  } else {
    mediaParams.set("image_url", content.asset_url);
  }

  const base = `https://graph.instagram.com/${config.graphVersion}/${encodeURIComponent(igUserId)}`;
  const container = await requestJson(`${base}/media`, {
    method: "POST",
    body: mediaParams
  });

  if (isVideo) {
    await waitForContainerReady({ base, accessToken, creationId: container.id });
  }

  const published = await requestJson(`${base}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({
      access_token: accessToken,
      creation_id: container.id
    })
  });

  return { platformPostId: published.id, raw: published };
}

async function publishThreads({ task, content }) {
  const accessToken = requireToken("THREADS_ACCESS_TOKEN");
  const userId = accountRef(task, "THREADS_USER_ID") || "me";
  const base = `${envValue("THREADS_API_BASE", "https://graph.threads.net/v1.0")}/${encodeURIComponent(userId)}`;
  const params = new URLSearchParams({
    access_token: accessToken,
    text: textWithLink(content, task)
  });

  if (content?.asset_url) {
    if (isVideoMedia(content.asset_url)) {
      params.set("media_type", "VIDEO");
      params.set("video_url", content.asset_url);
    } else {
      params.set("media_type", "IMAGE");
      params.set("image_url", content.asset_url);
    }
  } else {
    params.set("media_type", "TEXT");
  }

  const container = await requestJson(`${base}/threads`, { method: "POST", body: params });
  const published = await requestJson(`${base}/threads_publish`, {
    method: "POST",
    body: new URLSearchParams({
      access_token: accessToken,
      creation_id: container.id
    })
  });

  return { platformPostId: published.id, raw: published };
}

async function publishFacebook({ config, task, content }) {
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN nao configurado no backend.");
  const pageId = accountRef(task, "FACEBOOK_PAGE_ID");
  if (!pageId) throw new Error("Facebook precisa do Page ID no campo ID oficial/API ou em FACEBOOK_PAGE_ID.");

  const base = `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(pageId)}`;
  if (content?.asset_url && !isVideoMedia(content.asset_url)) {
    const photo = await requestJson(`${base}/photos`, {
      method: "POST",
      body: new URLSearchParams({
        access_token: accessToken,
        url: content.asset_url,
        caption: textWithLink(content, task)
      })
    });
    return { platformPostId: photo.post_id || photo.id, raw: photo };
  }

  const feed = await requestJson(`${base}/feed`, {
    method: "POST",
    body: new URLSearchParams({
      access_token: accessToken,
      message: textWithLink(content, task),
      ...(content?.published_url ? { link: content.published_url } : {})
    })
  });
  return { platformPostId: feed.id, raw: feed };
}

async function publishTikTok({ task, content }) {
  const accessToken = requireToken("TIKTOK_ACCESS_TOKEN");
  if (!content?.asset_url) throw new Error("TikTok Direct Post exige URL publica de foto ou video em dominio verificado.");
  const text = textWithLink(content, task);

  if (isVideoMedia(content.asset_url)) {
    const payload = {
      post_info: {
        title: text.slice(0, 2200),
        privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY",
        disable_duet: process.env.TIKTOK_DISABLE_DUET === "1",
        disable_comment: process.env.TIKTOK_DISABLE_COMMENT === "1",
        disable_stitch: process.env.TIKTOK_DISABLE_STITCH === "1"
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: content.asset_url
      }
    };
    const result = await requestJson("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify(payload)
    });
    return { platformPostId: result.data?.publish_id, raw: result };
  }

  const result = await requestJson("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      post_info: {
        title: (content.title || text).slice(0, 90),
        description: text.slice(0, 2200),
        privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY",
        disable_comment: process.env.TIKTOK_DISABLE_COMMENT === "1",
        auto_add_music: process.env.TIKTOK_AUTO_ADD_MUSIC !== "0"
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: [content.asset_url]
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO"
    })
  });
  return { platformPostId: result.data?.publish_id, raw: result };
}

async function linkedinRequest(path, accessToken, config, options = {}) {
  const response = await fetch(`https://api.linkedin.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": config.linkedinVersion,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = payload.message || JSON.stringify(payload);
    throw new Error(`LinkedIn ${response.status}: ${detail}`);
  }
  return payload;
}

async function uploadLinkedInImage({ config, accessToken, author, imageUrl }) {
  const init = await linkedinRequest("/rest/images?action=initializeUpload", accessToken, config, {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner: author } })
  });
  const uploadUrl = init.value?.uploadUrl;
  const imageUrn = init.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn nao retornou URL de upload de imagem.");

  const mediaResponse = await fetch(imageUrl);
  if (!mediaResponse.ok) throw new Error(`Nao foi possivel baixar a midia para enviar ao LinkedIn (${mediaResponse.status}).`);
  const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: mediaBuffer
  });
  if (!uploadResponse.ok) throw new Error(`Upload de imagem para o LinkedIn falhou (${uploadResponse.status}).`);

  return imageUrn;
}

async function publishLinkedIn({ config, task, content }) {
  const accessToken = requireToken("LINKEDIN_ACCESS_TOKEN");
  const author = accountRef(task, "LINKEDIN_AUTHOR_URN");
  if (!author) throw new Error("LinkedIn precisa do author URN no campo ID oficial/API ou em LINKEDIN_AUTHOR_URN.");
  if (content?.asset_url && isVideoMedia(content.asset_url)) {
    throw new Error("LinkedIn com video precisa do fluxo de upload em partes (nao implementado); publique apenas imagem ou texto nesta rede.");
  }

  const postBody = {
    author,
    commentary: textWithLink(content, task),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false
  };

  if (content?.asset_url) {
    const imageUrn = await uploadLinkedInImage({ config, accessToken, author, imageUrl: content.asset_url });
    postBody.content = { media: { id: imageUrn } };
  }

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": config.linkedinVersion,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(postBody)
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`LinkedIn ${response.status}: ${body}`);
  return { platformPostId: response.headers.get("x-restli-id") || "", raw: body ? JSON.parse(body) : {} };
}

async function publishX({ task, content }) {
  const accessToken = requireToken("X_ACCESS_TOKEN");
  const text = content?.asset_url ? `${textWithLink(content, task)}\n\n${content.asset_url}` : textWithLink(content, task);
  const result = await requestJson("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });
  return { platformPostId: result.data?.id, raw: result };
}

const publishers = {
  instagram: publishInstagram,
  threads: publishThreads,
  facebook: publishFacebook,
  tiktok: publishTikTok,
  linkedin: publishLinkedIn,
  x: publishX
};

async function getPendingTasks(config) {
  const filters = ["select=*", "status=in.(fila,agendado)", "buffer_post_id=is.null"];
  if (config.taskIds.length) {
    filters.push(`id=in.(${config.taskIds.map((id) => encodeURIComponent(id)).join(",")})`);
  }
  if (config.contentId) {
    filters.push(`content_id=eq.${encodeURIComponent(config.contentId)}`);
  }
  filters.push("order=scheduled_for.asc.nullsfirst,created_at.asc", `limit=${config.limit}`);
  return supabase(config, `distribution_tasks?${filters.join("&")}`);
}

async function getContent(config, contentId) {
  if (!contentId) return null;
  const rows = await supabase(config, `content_items?select=*&id=eq.${encodeURIComponent(contentId)}&limit=1`);
  return rows[0] || null;
}

async function getActiveSocialsForContent(config, content) {
  if (!content?.site_id) return [];
  const rows = await supabase(config, `social_accounts?select=*&site_id=eq.${encodeURIComponent(content.site_id)}&status=eq.ativo&order=created_at.asc`);
  return rows
    .filter((social) => cleanAccountRef(social.buffer_channel_id))
    .filter((social) => contentMatchesSocial(content, social));
}

async function getDistributionTasksForContent(config, contentId) {
  if (!contentId) return [];
  return supabase(config, `distribution_tasks?select=*&content_id=eq.${encodeURIComponent(contentId)}&order=created_at.asc`);
}

async function createDistributionTask(config, content, social) {
  const publishedUrl = content.published_url || "";
  const utmSource = socialUtmSource(social.channel);
  const utmCampaign = campaignNameFor(content);
  const scheduledFor = config.publishMode === "now" ? null : content.scheduled_for || null;
  const payload = {
    site_id: content.site_id,
    content_id: content.id,
    target: social.channel,
    buffer_channel_id: cleanAccountRef(social.buffer_channel_id),
    status: "fila",
    scheduled_for: scheduledFor,
    published_at: null,
    published_url: publishedUrl,
    utm_source: utmSource,
    utm_medium: "social",
    utm_campaign: utmCampaign,
    utm_url: buildUtmUrl(publishedUrl, utmSource, "social", utmCampaign),
    note: `Gerado automaticamente pelo backend oficial. Perfil: ${social.handle || social.channel}`
  };
  const rows = await supabase(config, "distribution_tasks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return rows[0];
}

async function ensureDistributionTasksForContent(config, contentId) {
  const content = await getContent(config, contentId);
  if (!content) return { createdTaskIds: [], resetTaskIds: [], expectedTargets: [], message: "Conteudo nao encontrado." };

  const socials = await getActiveSocialsForContent(config, content);
  const existingTasks = await getDistributionTasksForContent(config, content.id);
  const createdTaskIds = [];
  const resetTaskIds = [];

  for (const social of socials) {
    const account = cleanAccountRef(social.buffer_channel_id);
    const existing = existingTasks.find((task) => cleanAccountRef(task.buffer_channel_id) === account);

    if (!existing) {
      const created = await createDistributionTask(config, content, social);
      if (created?.id) createdTaskIds.push(created.id);
      continue;
    }

    if (existing.status === "erro" && !existing.buffer_post_id) {
      await patchTask(config, existing.id, {
        status: "fila",
        scheduled_for: config.publishMode === "now" ? null : content.scheduled_for || existing.scheduled_for || null,
        error_message: null
      });
      resetTaskIds.push(existing.id);
    }
  }

  return {
    createdTaskIds,
    resetTaskIds,
    expectedTargets: socials.map((social) => social.channel)
  };
}

async function patchTask(config, id, patch) {
  await supabase(config, `distribution_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
}

async function patchContent(config, id, patch) {
  if (!id) return;
  await supabase(config, `content_items?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
}

async function publishTask(config, task) {
  const platform = platformKey(task.target);
  const publisher = publishers[platform];
  const content = await getContent(config, task.content_id);

  if (!publisher) {
    await patchTask(config, task.id, {
      status: "erro",
      error_message: `Plataforma sem adaptador oficial: ${task.target || "sem alvo"}.`
    });
    return { id: task.id, skipped: true, reason: "plataforma sem adaptador", platform };
  }

  if (!content) {
    await patchTask(config, task.id, {
      status: "erro",
      error_message: "Conteudo nao encontrado."
    });
    return { id: task.id, skipped: true, reason: "conteudo nao encontrado", platform };
  }

  if (!textWithLink(content, task)) {
    await patchTask(config, task.id, {
      status: "erro",
      error_message: "Conteudo sem texto. Preencha o campo Texto do post."
    });
    return { id: task.id, skipped: true, reason: "sem texto", platform };
  }

  if (!isTaskDue(config, task)) {
    return { id: task.id, skipped: true, reason: `agendado para ${task.scheduled_for}; sera publicado quando o horario chegar`, platform };
  }

  if (config.dryRun) {
    return {
      id: task.id,
      dryRun: true,
      platform,
      accountRef: cleanAccountRef(task.buffer_channel_id),
      text: textWithLink(content, task),
      mediaUrl: content.asset_url || ""
    };
  }

  try {
    const post = await publisher({ config, task, content });
    const now = new Date().toISOString();
    await patchTask(config, task.id, {
      status: "publicado",
      published_at: now,
      buffer_post_id: post.platformPostId || "",
      error_message: null
    });
    await patchContent(config, task.content_id, {
      status: "Publicado",
      scheduled_for: null,
      published_at: now
    });
    return { id: task.id, platform, platformPostId: post.platformPostId || "", raw: post.raw };
  } catch (error) {
    await patchTask(config, task.id, {
      status: "erro",
      error_message: error.message.slice(0, 500)
    });
    return { id: task.id, platform, error: error.message };
  }
}

export async function publishPendingTasks(options = {}) {
  const config = resolveConfig(options);

  let ensured = null;
  if (config.contentId) {
    ensured = await ensureDistributionTasksForContent(config, config.contentId);
    const ensuredTaskIds = [...(ensured.createdTaskIds || []), ...(ensured.resetTaskIds || [])];
    if (ensuredTaskIds.length) {
      config.taskIds = [...new Set([...config.taskIds, ...ensuredTaskIds])];
    }
  }

  const tasks = await getPendingTasks(config);
  const results = [];
  for (const task of tasks) {
    results.push(await publishTask(config, task));
  }

  return {
    ok: true,
    dryRun: config.dryRun,
    tasks: tasks.length,
    published: results.filter((item) => item.platformPostId).length,
    ensured,
    results
  };
}
