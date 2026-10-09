import { ensureDatabase, getDatabase } from "./database";
import { briefSources, parseCalendar, parseStories, safeBriefLink, selectBrief, type BriefCache, type BriefSource, type BriefSourceState } from "./daily-brief";

const CACHE = "daily-brief:v1", LOCK = "daily-brief:lease";
async function readCache(): Promise<BriefCache | null> {
  const row = await getDatabase().prepare("SELECT value FROM settings WHERE key=?").bind(CACHE).first<{value:string}>();
  if (!row) return null;
  try { const value = JSON.parse(row.value); return value.version === 1 && Array.isArray(value.sources) ? value : null; } catch { return null; }
}
export async function readDailyBrief(now = new Date()) { await ensureDatabase(); return selectBrief(await readCache(), now); }

async function fetchSource(source: BriefSource, fetcher: typeof fetch, now: Date) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12_000);
  try {
    let url: string = source.url, response: Response;
    if (source.id.startsWith("fred-")) {
      const query = new URL(url), window=selectBrief(null,now).window;
      query.searchParams.set("vs",window.start);query.searchParams.set("ve",window.end);url=query.href;
    }
    for (let redirects=0; ; redirects++) {
      response = await fetcher(url, { signal: controller.signal, redirect: "manual", headers: { Accept: "*/*", "User-Agent": "Oliver-Alpha-Lab/1.0" } });
      if (![301,302,303,307,308].includes(response.status)) break;
      await response.body?.cancel();
      const location = response.headers.get("location");
      const next = location && safeBriefLink(new URL(location,url).href,source);
      if (!next || redirects >= 3) throw new Error("Unrecognized feed redirect");
      url = next;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error("Empty response");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let size = 0, text = "";
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1_500_000) throw new Error("Feed too large");
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } finally { await reader.cancel().catch(() => {}); }
  } finally { clearTimeout(timer); }
}

export async function refreshDailyBrief(trigger: "MANUAL" | "STALE_OPEN" | "CRON" = "STALE_OPEN", fetcher: typeof fetch = fetch, now = new Date(), calendarFeeds: Record<string,string> = {}) {
  await ensureDatabase();
  const db = getDatabase(), stamp = now.toISOString(), token = crypto.randomUUID();
  const lease = await db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE settings.updated_at<=?`)
    .bind(LOCK, token, new Date(now.getTime()+60_000).toISOString(), stamp).run();
  if (!lease.meta.changes) return { ...await readDailyBrief(now), refreshing: true, retryAfterSeconds: 15 };
  try {
    const cache = await readCache(), missingSource=briefSources.some(source=>!cache?.sources.some(state=>state.id===source.id));
    const cooldown = missingSource || Object.keys(calendarFeeds).length ? 0 : trigger === "MANUAL" ? 30_000 : selectBrief(cache,now).refreshAfterSeconds*1000;
    const age = cache ? now.getTime()-Date.parse(cache.checkedAt) : Infinity;
    if (age < cooldown) return { ...selectBrief(cache,now), retryAfterSeconds: Math.ceil((cooldown-age)/1000) };
    const sources: BriefSourceState[] = await Promise.all(briefSources.map(async source => {
      const previous = cache?.sources.find(item => item.id === source.id);
      try {
        // Reuse fresh official calendars without pretending they were fetched again.
        if(source.id.startsWith("fred-") && !calendarFeeds[source.id]) {
          if(previous?.lastSuccessAt && now.getTime()-Date.parse(previous.lastSuccessAt)<18*3_600_000) return {...previous,checkedAt:stamp};
        }
        const raw = calendarFeeds[source.id] ?? await fetchSource(source, fetcher, now);
        return { id: source.id, checkedAt: stamp, lastSuccessAt: stamp, error: null,
          stories: source.kind === "news" ? parseStories(raw,source) : [],
          events: source.kind === "calendar" ? parseCalendar(raw,source).filter(event => event.at.slice(0,10) >= stamp.slice(0,10)).slice(0,100) : [] };
      } catch (error) {
        console.warn("Daily brief source unavailable", source.id, error instanceof Error ? error.message : "Unknown error");
        const reason = error instanceof Error && /^HTTP \d{3}$|^Unrecognized|^No recognizable|^Feed too large|^Empty response/.test(error.message) ? error.message : "Source temporarily unavailable";
        return { id: source.id, checkedAt: stamp, lastSuccessAt: previous?.lastSuccessAt ?? null, error: reason, stories: previous?.stories ?? [], events: previous?.events ?? [] };
      }
    }));
    const updated: BriefCache = { version: 1, checkedAt: stamp, sources };
    // A timed-out worker must not overwrite a newer refresh after losing its lease.
    await db.prepare(`INSERT INTO settings(key,value,updated_at)
      SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=? AND updated_at>?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
      .bind(CACHE, JSON.stringify(updated), stamp, LOCK, token, new Date().toISOString()).run();
    const result = selectBrief(await readCache(),now);
    const previousUrls = new Set(selectBrief(cache,now).stories.map(story=>story.url));
    return { ...result, refreshed: result.checkedAt === stamp, newStoryCount: result.stories.filter(story=>!previousUrls.has(story.url)).length };
  } finally { await db.prepare("DELETE FROM settings WHERE key=? AND value=?").bind(LOCK,token).run(); }
}
