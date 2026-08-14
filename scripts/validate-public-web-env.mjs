const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
];

const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(
    `Missing required public web environment: ${missing.join(", ")}`,
  );
  process.exit(1);
}

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
  let url;
  try {
    url = new URL(process.env[name]);
  } catch {
    console.error(`${name} must be a valid URL.`);
    process.exit(1);
  }

  if (url.protocol !== "https:") {
    console.error(`${name} must use HTTPS.`);
    process.exit(1);
  }
}

console.log("Required public web environment is configured.");
