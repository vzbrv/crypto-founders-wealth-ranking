import { appendFile } from "node:fs/promises";

const required = [
  "PUBLIC_SITE_URL",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "CRON_SECRET",
];
const checks = [];

function record(name, passed, status) {
  checks.push({ name, passed, status });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${status}`);
}

async function writeSummary() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const rows = checks
    .map(
      ({ name, passed, status }) =>
        `| ${passed ? "Pass" : "Fail"} | ${name} | ${status} |`,
    )
    .join("\n");
  await appendFile(
    summaryPath,
    `## Production HTTP verification\n\n| Result | Check | Response |\n| --- | --- | --- |\n${rows}\n`,
  );
}

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  for (const name of missing) {
    record(
      `configuration-${name}`,
      false,
      `Manual configuration missing: add ${name} to the protected production environment.`,
    );
  }
  await writeSummary();
  process.exit(1);
}

const siteUrl = process.env.PUBLIC_SITE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const publicHeaders = { apikey: process.env.SUPABASE_PUBLISHABLE_KEY };

async function check(name, request, accepted = [200], validate) {
  try {
    const response = await request();
    let passed = accepted.includes(response.status);
    let status = `HTTP ${response.status}`;
    if (passed && validate) {
      const validation = await validate(response);
      passed = validation.passed;
      status = `${status}; ${validation.status}`;
    }
    record(name, passed, status);
  } catch {
    record(name, false, "request failed before receiving an HTTP response");
  }
}

for (const route of [
  "/",
  "/status",
  "/methodology",
  "/sources",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
]) {
  await check(`site-${route}`, () =>
    fetch(new URL(route, siteUrl), { redirect: "follow" }),
  );
}

for (const view of [
  "public_leaderboard",
  "current_scores",
  "public_provider_status",
  "public_project_details",
]) {
  await check(`read-${view}`, () =>
    fetch(new URL(`/rest/v1/${view}?select=*&limit=1`, supabaseUrl), {
      headers: publicHeaders,
    }),
  );
}

await check(
  "anonymous-write-projects-rejected",
  () =>
    fetch(new URL("/rest/v1/projects", supabaseUrl), {
      method: "POST",
      headers: { ...publicHeaders, "content-type": "application/json" },
      body: JSON.stringify({ slug: "production-verification-must-not-write" }),
    }),
  [401, 403],
);

await check(
  "anonymous-read-provider-health-rejected",
  () =>
    fetch(
      new URL("/rest/v1/provider_health?select=provider&limit=1", supabaseUrl),
      { headers: publicHeaders },
    ),
  [401, 403],
);

await check(
  "provider-health-function",
  () =>
    fetch(new URL("/functions/v1/provider-health", supabaseUrl), {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET },
    }),
  [200, 503],
  async (response) => {
    try {
      const body = await response.json();
      const validStatus =
        body?.status === "healthy" || body?.status === "degraded";
      return {
        passed: validStatus,
        status: validStatus
          ? `reported ${body.status}`
          : "expected a healthy or degraded status",
      };
    } catch {
      return { passed: false, status: "response was not valid JSON" };
    }
  },
);

await writeSummary();
if (checks.some(({ passed }) => !passed)) process.exit(1);
