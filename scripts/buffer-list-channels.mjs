const BUFFER_API_KEY = process.env.BUFFER_API_KEY;
const BUFFER_ENDPOINT = process.env.BUFFER_ENDPOINT || "https://api.buffer.com";

if (!BUFFER_API_KEY) {
  console.error("BUFFER_API_KEY nao configurado. Rode com a chave em variavel de ambiente ou use o GitHub Actions.");
  process.exit(1);
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
  return payload.data;
}

const accountData = await bufferGraphql(`
  query GetOrganizations {
    account {
      id
      organizations {
        id
        name
      }
    }
  }
`);

const organizations = accountData?.account?.organizations || [];
if (!organizations.length) {
  console.log("Nenhuma organizacao Buffer encontrada para esta chave.");
  process.exit(0);
}

for (const organization of organizations) {
  const channelData = await bufferGraphql(`
    query GetChannels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId }) {
        id
        name
        displayName
        service
        isQueuePaused
      }
    }
  `, { organizationId: organization.id });

  console.log(`\nOrganizacao: ${organization.name || organization.id}`);
  for (const channel of channelData.channels || []) {
    console.log(`${channel.id}\t${channel.service}\t${channel.displayName || channel.name}\tfila pausada: ${channel.isQueuePaused}`);
  }
}
