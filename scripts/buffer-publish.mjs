const SUPABASE_URL = process.env.SUPABASE_URL || "https://nbbprjduqtndkwbknyud.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_q4AiMHgZ-zx-88KMCRiNFg_OpztyQZv";
const BUFFER_API_KEY = process.env.BUFFER_API_KEY;
const BUFFER_ENDPOINT = process.env.BUFFER_ENDPOINT || "https://api.buffer.com";
const LIMIT = Number(process.env.PUBLISH_LIMIT || 10);
const DRY_RUN = process.env.DRY_RUN === "1";

if (!BUFFER_API_KEY && !DRY_RUN) {
  console.error("BUFFER_API_KEY nao configurado. Adicione o segredo no GitHub Actions antes de rodar.");
  process.exit(1);
}

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
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

async function bufferGraphql(query, variables = {}) {
  const response = await fetch(BUFFER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BUFFER_API_KEY}`
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Buffer ${response.status}: ${JSON.stringify(payload)}`);
  if (payload?.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  return payload;
}

async function getPendingTasks() {
  return supabase(
    `distribution_tasks?select=*&status=in.(fila,agendado)&buffer_post_id=is.null&order=created_at.asc&limit=${LIMIT}`
  );
}

async function getContent(contentId) {
  if (!contentId) return null;
  const rows = await supabase(`content_items?select=*&id=eq.${encodeURIComponent(contentId)}&limit=1`);
  return rows[0] || null;
}

function mediaAsset(url) {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|m4v|webm)$/.test(cleanUrl)) return { video: { url } };
  return { image: { url } };
}

function buildPostInput(task, content) {
  const channelId = task.buffer_channel_id;
  const text = [content?.body || content?.title || task.note, task.utm_url]
    .filter(Boolean)
    .join("\n\n");
  const input = {
    text,
    channelId,
    schedulingType: "automatic",
    mode: "addToQueue"
  };

  const dueAt = task.scheduled_for ? new Date(task.scheduled_for) : null;
  if (dueAt && !Number.isNaN(dueAt.getTime()) && dueAt.getTime() > Date.now() + 60_000) {
    input.mode = "customScheduled";
    input.dueAt = dueAt.toISOString();
  }

  const asset = mediaAsset(content?.asset_url);
  if (asset) input.assets = [asset];

  return input;
}

async function createBufferPost(input) {
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
  const payload = await bufferGraphql(query, { input });
  const result = payload?.data?.createPost;
  if (result?.message) throw new Error(result.message);
  if (!result?.post?.id) throw new Error(`Resposta inesperada do Buffer: ${JSON.stringify(payload)}`);
  return result.post;
}

async function patchTask(id, patch) {
  await supabase(`distribution_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
}

async function patchContent(id, patch) {
  if (!id) return;
  await supabase(`content_items?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
}

async function publishTask(task) {
  if (!task.buffer_channel_id) {
    await patchTask(task.id, {
      status: "erro",
      error_message: "Sem buffer_channel_id. Preencha o canal Buffer na fila de distribuicao."
    });
    return { id: task.id, skipped: true, reason: "sem canal Buffer" };
  }

  const content = await getContent(task.content_id);
  const input = buildPostInput(task, content);
  if (!input.text.trim()) {
    await patchTask(task.id, {
      status: "erro",
      error_message: "Conteudo sem texto. Preencha o campo Texto do post."
    });
    return { id: task.id, skipped: true, reason: "sem texto" };
  }

  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, taskId: task.id, input }, null, 2));
    return { id: task.id, dryRun: true };
  }

  try {
    const post = await createBufferPost(input);
    const now = new Date().toISOString();
    await patchTask(task.id, {
      status: "agendado",
      scheduled_for: post.dueAt || task.scheduled_for || now,
      buffer_post_id: post.id,
      error_message: null
    });
    await patchContent(task.content_id, {
      status: "Agendado",
      scheduled_for: post.dueAt || task.scheduled_for || now
    });
    return { id: task.id, bufferPostId: post.id, dueAt: post.dueAt || null };
  } catch (error) {
    await patchTask(task.id, {
      status: "erro",
      error_message: error.message.slice(0, 500)
    });
    return { id: task.id, error: error.message };
  }
}

const tasks = await getPendingTasks();
console.log(`Encontradas ${tasks.length} tarefas de distribuicao.`);

const results = [];
for (const task of tasks) {
  results.push(await publishTask(task));
}

console.log(JSON.stringify(results, null, 2));
