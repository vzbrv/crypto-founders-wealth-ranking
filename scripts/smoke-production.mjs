const required = [
  "PUBLIC_SITE_URL",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "CRON_SECRET",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(JSON.stringify({ event: "configuration_error", missing }));
  process.exit(1);
}

const siteUrl = process.env.PUBLIC_SITE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const publicHeaders = { apikey: publishableKey };
const checks = [];

async function check(name, url, options = {}, accepted = [200]) {
  try {
    const response = await fetch(url, { redirect: "follow", ...options });
    const passed = accepted.includes(response.status);
    checks.push({ name, passed, status: response.status });
  } catch {
    checks.push({ name, passed: false, status: "network_error" });
  }
}

await check("site-home", new URL("/", siteUrl));
await check("site-status", new URL("/status", siteUrl));
for (const view of [
  "public_leaderboard",
  "current_scores",
  "public_provider_status",
]) {
  await check(
    `read-${view}`,
    new URL(`/rest/v1/${view}?select=*&limit=1`, supabaseUrl),
    { headers: publicHeaders },
  );
}
await check(
  "anonymous-write-blocked",
  new URL("/rest/v1/projects", supabaseUrl),
  {
    method: "POST",
    headers: { ...publicHeaders, "content-type": "application/json" },
    body: JSON.stringify({ slug: "smoke-test-must-not-write" }),
  },
  [401, 403],
);
await check(
  "provider-health",
  new URL("/functions/v1/provider-health", supabaseUrl),
  { method: "POST", headers: { "x-cron-secret": cronSecret } },
  [200, 503],
);

for (const result of checks) console.log(JSON.stringify(result));
if (checks.some(({ passed }) => !passed)) process.exit(1);
