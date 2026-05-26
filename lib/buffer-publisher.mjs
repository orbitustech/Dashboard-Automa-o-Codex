const DEFAULT_SUPABASE_URL = "https://nbbprjduqtndkwbknyud.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_q4AiMHgZ-zx-88KMCRiNFg_OpztyQZv";
const DEFAULT_BUFFER_ENDPOINT = "https://api.buffer.com";

function envValue(name, fallback = "") {
  return process.env[name] || fallback;
}

function cleanBufferChannelId(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function resolveConfig(options = {}) {
  return {
    supabaseUrl: options.supabaseUrl || envValue("SUPABASE_URL", DEFAULT_SUPABASE_URL),
    supabaseKey: options.supabaseKey || envValue("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_KEY),
    bufferApiKey: options.bufferApiKey || envValue("BUFFER_API_KEY"),
    bufferEndpoint: options.bufferEndpoint || envValue("BUFFER_ENDPOINT", DEFAULT_BUFFER_ENDPOINT),
    limit: Number(options.limit || envValue("PUBLISH_LIMIT", "10")),
    dryRun: Boolean(options.dryRun ?? envValue("DRY_RUN") === "1"),
    publishMode: options.publishMode === "now" ? "now" : "queue",
    taskIds: Array.isArray(options.taskIds) ? options.taskIds.filter(Boolean) : [],
    contentId: options.contentId || ""
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

async function bufferGraphql(config, query, variables = {}) {
  const response = await fetch(config.bufferEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.bufferApiKey}`
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Buffer ${response.status}: ${JSON.stringify(payload)}`);
  if (payload?.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  return payload;
}

function mediaAsset(url) {
  if (!url) return null;
  if (String(url).startsWith("data:")) {
    throw new Error("A midia esta salva como previa local. Envie JPG/PNG pelo backend ou use uma URL publica.");
  }
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|m4v|webm)$/.test(cleanUrl)) return { video: { url } };
  return { image: { url } };
}

function isInstagramTask(task) {
  return /instagram/i.test(`${task.target || ""} ${task.note || ""}`);
}

function buildPostInput(task, content, config) {
  const channelId = cleanBufferChannelId(task.buffer_channel_id);
  const text = [content?.body || content?.title || task.note, task.utm_url]
    .filter(Boolean)
    .join("\n\n");
  const input = {
    text,
    channelId,
    schedulingType: "automatic",
    mode: "addToQueue"
  };

  if (isInstagramTask(task)) {
    input.metadata = {
      instagram: {
        type: "post",
        shouldShareToFeed: true
      }
    };
  }

  if (config.publishMode === "now") {
    input.mode = "shareNow";
  }

  const dueAt = task.scheduled_for ? new Date(task.scheduled_for) : null;
  if (config.publishMode !== "now" && dueAt && !Number.isNaN(dueAt.getTime()) && dueAt.getTime() > Date.now() + 60_000) {
    input.mode = "customScheduled";
    input.dueAt = dueAt.toISOString();
  }

  const asset = mediaAsset(content?.asset_url);
  if (asset) input.assets = [asset];

  return input;
}

async function getPendingTasks(config) {
  const filters = ["select=*", "status=in.(fila,agendado)", "buffer_post_id=is.null"];
  if (config.taskIds.length) {
    filters.push(`id=in.(${config.taskIds.map((id) => encodeURIComponent(id)).join(",")})`);
  }
  if (config.contentId) {
    filters.push(`content_id=eq.${encodeURIComponent(config.contentId)}`);
  }
  filters.push("order=created_at.asc", `limit=${config.limit}`);
  return supabase(config, `distribution_tasks?${filters.join("&")}`);
}

async function getContent(config, contentId) {
  if (!contentId) return null;
  const rows = await supabase(config, `content_items?select=*&id=eq.${encodeURIComponent(contentId)}&limit=1`);
  return rows[0] || null;
}

async function createBufferPost(config, input) {
  const query = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            text
            status
            dueAt
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;
  const payload = await bufferGraphql(config, query, { input });
  const result = payload?.data?.createPost;
  if (result?.message) throw new Error(result.message);
  if (!result?.post?.id) throw new Error(`Resposta inesperada do Buffer: ${JSON.stringify(payload)}`);
  return result.post;
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
  if (!task.buffer_channel_id) {
    await patchTask(config, task.id, {
      status: "erro",
      error_message: "Sem buffer_channel_id. Preencha o canal Buffer na fila de distribuicao."
    });
    return { id: task.id, skipped: true, reason: "sem canal Buffer" };
  }

  const content = await getContent(config, task.content_id);
  let input;
  try {
    input = buildPostInput(task, content, config);
  } catch (error) {
    await patchTask(config, task.id, {
      status: "erro",
      error_message: error.message.slice(0, 500)
    });
    return { id: task.id, skipped: true, reason: error.message };
  }

  if (!input.text.trim()) {
    await patchTask(config, task.id, {
      status: "erro",
      error_message: "Conteudo sem texto. Preencha o campo Texto do post."
    });
    return { id: task.id, skipped: true, reason: "sem texto" };
  }

  if (config.dryRun) {
    return { id: task.id, dryRun: true, input };
  }

  try {
    const post = await createBufferPost(config, input);
    const now = new Date().toISOString();
    const sharedNow = input.mode === "shareNow";
    await patchTask(config, task.id, {
      status: sharedNow ? "publicado" : "agendado",
      scheduled_for: post.dueAt || task.scheduled_for || now,
      published_at: sharedNow ? now : null,
      buffer_post_id: post.id,
      error_message: null
    });
    await patchContent(config, task.content_id, {
      status: sharedNow ? "Publicado" : "Agendado",
      scheduled_for: sharedNow ? null : post.dueAt || task.scheduled_for || now,
      published_at: sharedNow ? now : null
    });
    return { id: task.id, bufferPostId: post.id, dueAt: post.dueAt || null, sharedNow };
  } catch (error) {
    await patchTask(config, task.id, {
      status: "erro",
      error_message: error.message.slice(0, 500)
    });
    return { id: task.id, error: error.message };
  }
}

export async function publishPendingTasks(options = {}) {
  const config = resolveConfig(options);
  if (!config.bufferApiKey && !config.dryRun) {
    return {
      ok: false,
      published: 0,
      tasks: 0,
      results: [],
      warning: "BUFFER_API_KEY nao configurado. Nada sera publicado ate o segredo existir."
    };
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
    published: results.filter((item) => item.bufferPostId).length,
    results
  };
}
