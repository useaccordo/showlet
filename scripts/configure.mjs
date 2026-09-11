import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync } from "node:fs";
const ask = createInterface({ input: process.stdin, output: process.stdout });
try {
  const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
  const account = (await ask.question("Cloudflare account ID: ")).trim();
  const host = (
    await ask.question("Custom hostname (e.g. clips.example.com): ")
  ).trim();
  const db = (await ask.question("D1 database ID: ")).trim();
  const issuer = (
    await ask.question(
      "Access issuer (https://your-team.cloudflareaccess.com): ",
    )
  )
    .trim()
    .replace(/\/$/, "");
  const aud = (await ask.question("Access application AUD: ")).trim();
  const admins = (
    await ask.question("Initial admin emails (comma separated): ")
  ).trim();
  if (
    !/^[a-f0-9]{32}$/.test(account) ||
    !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(host) ||
    !/^[a-f0-9-]{36}$/.test(db) ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(issuer) ||
    !aud ||
    !admins.split(",").every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()))
  )
    throw Error("Invalid configuration. File unchanged.");
  config.account_id = account;
  config.routes = [{ pattern: host, custom_domain: true }];
  config.d1_databases[0].database_id = db;
  Object.assign(config.vars, {
    ACCOUNT_ID: account,
    ORIGIN: "https://" + host,
    ACCESS_ISSUER: issuer,
    ACCESS_AUD: aud,
    ADMIN_EMAILS: admins,
  });
  writeFileSync("wrangler.jsonc", JSON.stringify(config, null, 2) + "\n");
  console.log(
    "Configuration saved locally. Review it before deploying. No secrets were requested.",
  );
} finally {
  ask.close();
}
