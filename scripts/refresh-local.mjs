import { readFile } from "node:fs/promises";

const mode = String(process.argv[2] ?? "MORNING").toUpperCase();
if (!new Set(["MORNING", "AFTERNOON"]).has(mode)) {
  console.error("Mode must be MORNING or AFTERNOON");
  process.exit(1);
}
const text = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
const vars = Object.fromEntries(text.split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
if (!vars.CRON_SECRET || vars.ALLOW_DEV_REFRESH !== "true") {
  throw new Error("Set CRON_SECRET and ALLOW_DEV_REFRESH=true in .dev.vars");
}
const response = await fetch(`http://localhost:3000/api/cron/daily?mode=${mode}`, {
  method: "POST",
  headers: { authorization: `Bearer ${vars.CRON_SECRET}` },
});
const body = await response.text();
console.log(body);
if (!response.ok) process.exit(1);
