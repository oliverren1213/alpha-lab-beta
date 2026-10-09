// Fixed public feeds/calendars only. No account data, paid model, or price scraping.
export const briefSources = [
  { id: "fed", label: "Federal Reserve", kind: "news", url: "https://www.federalreserve.gov/feeds/press_monetary.xml", home: "https://www.federalreserve.gov/monetarypolicy.htm", hosts: ["www.federalreserve.gov"] },
  { id: "ecb", label: "ECB", kind: "news", url: "https://www.ecb.europa.eu/rss/press.html", home: "https://www.ecb.europa.eu/press/html/index.en.html", hosts: ["www.ecb.europa.eu"] },
  { id: "bea", label: "BEA", kind: "news", url: "https://apps.bea.gov/rss/rss.xml", home: "https://www.bea.gov/news", hosts: ["www.bea.gov", "apps.bea.gov"] },
  { id: "nvidia", label: "NVIDIA Newsroom", kind: "news", url: "https://nvidianews.nvidia.com/releases.xml", home: "https://nvidianews.nvidia.com/", hosts: ["nvidianews.nvidia.com", "blogs.nvidia.com", "investor.nvidia.com"] },
  { id: "google", label: "Google Blog", kind: "news", url: "https://blog.google/rss/", home: "https://blog.google/", hosts: ["blog.google", "blog.google.com"] },
  { id: "bea-calendar", label: "BEA calendar", kind: "calendar", url: "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics", home: "https://www.bea.gov/news/schedule", hosts: ["www.bea.gov"] },
  { id: "fed-calendar", label: "FOMC calendar", kind: "calendar", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", home: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", hosts: ["www.federalreserve.gov"] },
  { id: "ecb-calendar", label: "ECB calendar", kind: "calendar", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", home: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", hosts: ["www.ecb.europa.eu"] },
  { id: "fred-jobs", label: "FRED · Employment Situation", kind: "calendar", url: "https://fred.stlouisfed.org/releases/calendar?rid=50", home: "https://fred.stlouisfed.org/release?rid=50", hosts: ["fred.stlouisfed.org"] },
  { id: "fred-cpi", label: "FRED · CPI", kind: "calendar", url: "https://fred.stlouisfed.org/releases/calendar?rid=10", home: "https://fred.stlouisfed.org/release?rid=10", hosts: ["fred.stlouisfed.org"] },
  { id: "fred-claims", label: "FRED · Initial claims", kind: "calendar", url: "https://fred.stlouisfed.org/releases/calendar?rid=180", home: "https://fred.stlouisfed.org/release?rid=180", hosts: ["fred.stlouisfed.org"] },
  { id: "market-news", label: "Major publishers · Google News", kind: "news", url: "https://news.google.com/rss/search?q=US%20jobs%20report%20OR%20nonfarm%20payroll%20OR%20Federal%20Reserve%20OR%20CPI%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen", home: "https://news.google.com/", hosts: ["news.google.com"] },
] as const;
export type BriefSource = typeof briefSources[number];
export type BriefTopic = "rates" | "inflation" | "growth" | "earnings" | "company" | "employment";
export type BriefStory = { title: string; excerpt?: string; publisher?: string; url: string; publishedAt: string; sourceId: string; topic: BriefTopic; score: number; event: string };
export type BriefEvent = { title: string; at: string; dateOnly: boolean; sourceId: string; url: string; topic: BriefTopic };
export type BriefSourceState = { id: string; checkedAt: string; lastSuccessAt: string | null; error: string | null; stories: BriefStory[]; events: BriefEvent[] };
export type BriefCache = { version: 1; checkedAt: string; sources: BriefSourceState[] };
export type DailyBrief = { checkedAt: string | null; stale: boolean; stories: BriefStory[]; events: BriefEvent[]; focusEvents: BriefEvent[]; refreshAfterSeconds: number; window: { start: string; end: string }; sources: Array<Omit<BriefSourceState, "stories" | "events">>; refreshing?: boolean; retryAfterSeconds?: number; refreshed?: boolean; newStoryCount?: number };
const HOUR = 3_600_000;

export function briefEventDay(event: BriefEvent) {
  return event.dateOnly ? event.at : new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Rome", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(event.at));
}

export function briefStoryHeading(story: BriefStory, en: boolean) {
  const period = story.title.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:[1-4](?:st|nd|rd|th)\s+Quarter|Quarter\s+[1-4])\s+\d{4}/i)?.[0];
  const heading = story.event === "us-pce" ? (en ? "US income, spending & PCE" : "美国收入、消费与 PCE")
    : story.event === "us-gdp" ? (en ? "US GDP release" : "美国 GDP 发布")
    : story.event === "fed-policy" ? (en ? "Federal Reserve policy update" : "美联储政策更新")
    : story.event === "ecb-policy" ? (en ? "ECB policy update" : "ECB 政策更新") : story.title;
  return heading + (period && heading !== story.title ? ` · ${period}` : "");
}

export function plainText(raw: string) {
  return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => { const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1),16) : Number(n); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; })
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name: string) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[name]!)
    .replace(/\s+/g, " ").trim();
}
function tag(raw: string, name: string) { return plainText(raw.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] ?? ""); }
export function safeBriefLink(raw: string, source: BriefSource) {
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password && !url.port && source.hosts.some(host => host === url.hostname) ? url.href : null; } catch { return null; }
}

// ponytail: conservative title rules, not a claim of comprehensive market coverage.
function classify(title: string, id: string): { topic: BriefTopic; score: number; event: string } | null {
  if (id === "market-news") {
    // Headlines are attributed reports, not verified releases or model summaries.
    if (/preview|forecast|expected|ahead of|what to expect|scheduled|opinion|prediction|could|may |likely|futures|before US jobs/i.test(title)) return null;
    if (/non.?farm|payrolls?|US jobs report|U\.S\. jobs report|US job growth|U\.S\. job growth/i.test(title)) return { topic:"employment",score:110,event:"us-employment" };
    if (/CPI|consumer prices|consumer price index/i.test(title)) return { topic:"inflation",score:105,event:"us-cpi" };
    if (/(Fed|Federal Reserve|ECB).*(rate|inflation|policy|decision)/i.test(title)) return { topic:"rates",score:100,event:"policy-report" };
    return null;
  }
  if (id === "fed" && /FOMC statement|economic projections|interest on reserve balances/i.test(title)) return { topic: "rates", score: /statement/i.test(title) ? 100 : 95, event: "fed-policy" };
  if (id === "ecb" && /monetary policy decisions|key ECB interest rates/i.test(title)) return { topic: "rates", score: 100, event: "ecb-policy" };
  if (id === "bea" && /^Personal Income and Outlays/i.test(title)) return { topic: "inflation", score: 94, event: "us-pce" };
  if (id === "bea" && /^(Gross Domestic Product|GDP\b)/i.test(title) && !/^GDP (by|for)/i.test(title)) return { topic: "growth", score: 92, event: "us-gdp" };
  if (["nvidia", "google"].includes(id)) {
    if (/financial results|quarterly results|quarter.*revenue|earnings results/i.test(title)) return { topic: "earnings", score: 90, event: `${id}-earnings` };
    if (/acqui(res|sition)|export (control|restriction)|antitrust|billion.*(invest|infrastructure)|invest.*billion/i.test(title)) return { topic: "company", score: 80, event: `${id}-company` };
  }
  return null;
}

export function parseStories(raw: string, source: BriefSource): BriefStory[] {
  if (!/<rss[\s>]/i.test(raw) || !/<\/rss>/i.test(raw)) throw new Error("Unrecognized feed");
  const result: BriefStory[] = [];
  for (const match of raw.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const title = tag(match[1], "title").slice(0, 320), url = safeBriefLink(tag(match[1], "link"), source);
    const published = Date.parse(tag(match[1], "pubDate")), category = classify(title, source.id);
    const publisher = source.id === "market-news" ? tag(match[1],"source") : "";
    if (source.id === "market-news" && !/^(Reuters|Associated Press|AP News|CNBC|Bloomberg(?:\.com)?|Financial Times|The Wall Street Journal|BBC(?: News)?|The Guardian|MarketWatch|Yahoo Finance|CNN(?: Business)?)$/i.test(publisher)) continue;
    const description = source.id === "market-news" ? "" : tag(match[1], "description");
    const excerpt = description.length > 400 ? description.slice(0,400).replace(/\s+\S*$/, "") + "…" : description;
    if (url && Number.isFinite(published) && category) result.push({ title, ...(excerpt ? {excerpt} : {}), ...(publisher ? {publisher} : {}), url, publishedAt: new Date(published).toISOString(), sourceId: source.id, ...category });
  }
  return result.sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 30);
}

function dateOnly(year: number, month: number, day: number) {
  const value = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value ? value : null;
}
export function centralReleaseTime(day: string, hour: number, minute: number) {
  const wall = Date.parse(`${day}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00Z`);
  let time = wall;
  for (let i=0;i<2;i++) {
    const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(time)).map(p=>[p.type,p.value]));
    time += wall-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  }
  return new Date(time).toISOString();
}
export function briefEventHeading(event: BriefEvent, en: boolean) {
  if (event.sourceId==="fred-jobs") return en ? "US jobs · payrolls, unemployment & wages" : "美国就业 · 非农、失业率、时薪";
  if (event.sourceId==="fred-cpi") return en ? "US CPI · inflation" : "美国 CPI · 通胀";
  if (event.sourceId==="fred-claims") return en ? "US initial jobless claims" : "美国初请失业金人数";
  if (event.sourceId==="fed-calendar") return en ? "FOMC · final meeting day" : "美联储议息 · 最后一天";
  if (event.sourceId==="ecb-calendar") return en ? "ECB · final meeting day" : "ECB 议息 · 最后一天";
  return event.topic==="inflation" ? en ? "US income, spending & PCE" : "美国收入、支出与 PCE" : en ? "US GDP release" : "美国 GDP 发布";
}
export function parseCalendar(raw: string, source: BriefSource): BriefEvent[] {
  const result: BriefEvent[] = [];
  const add = (title: string, at: string | null, dateOnly: boolean, topic: BriefTopic) => { if (at) result.push({ title, at, dateOnly, topic, sourceId: source.id, url: source.home }); };
  if (source.id.startsWith("fred-")) {
    if (!raw.includes('id="release-dates-pager"') || !raw.includes("All times are US Central Time")) throw new Error("Unrecognized FRED calendar");
    const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
    const rid=new URL(source.url).searchParams.get("rid"); let day: string | null=null;
    const table=raw.slice(raw.indexOf('id="release-dates-pager"')).split("</tbody>")[0];
    for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const stamp=plainText(row[1]).match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\w+)\s+(\d{2}),\s+(\d{4})/);
      if(stamp) {day=dateOnly(Number(stamp[3]),months.indexOf(stamp[1])+1,Number(stamp[2]));continue;}
      const link=row[1].match(/href="\/release\?rid=(\d+)"[^>]*>([^<]+)<\/a>/);
      if(!day || link?.[1]!==rid)continue;
      const clock=plainText(row[1]).match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
      const at=clock?centralReleaseTime(day,Number(clock[1])%12+(clock[3].toLowerCase()==="pm"?12:0),Number(clock[2])):day;
      add(plainText(link[2]),at,!clock,source.id==="fred-cpi"?"inflation":"employment");
    }
    return result; // A verified empty seven-day calendar is valid, not a parser failure.
  } else if (source.id === "bea-calendar") {
    if (!raw.includes("END:VCALENDAR")) throw new Error("Unrecognized calendar");
    const unfolded = raw.replace(/\r?\n[ \t]/g, "");
    for (const match of unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)) {
      const title = (match[1].match(/(?:^|\n)SUMMARY:(.*)/)?.[1] ?? "").trim().replace(/\\n/g, " ").replace(/\\([,;\\])/g, "$1");
      const topic = /^Personal Income and Outlays/i.test(title) ? "inflation" : /^(Gross Domestic Product|GDP\b)/i.test(title) && !/^(Gross Domestic Product|GDP) (by|for)\b/i.test(title) ? "growth" : null;
      const stamp = match[1].match(/(?:^|\n)DTSTART(?:;VALUE=DATE-TIME)?:([\d]{4})([\d]{2})([\d]{2})T([\d]{2})([\d]{2})([\d]{2})Z/);
      if (topic && stamp) { const at = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`; if (Number.isFinite(Date.parse(at))) add(title, at, false, topic); }
    }
  } else if (source.id === "fed-calendar") {
    const sections = [...raw.matchAll(/(\d{4}) FOMC Meetings/g)];
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    for (let i=0; i<sections.length; i++) {
      const part = raw.slice(sections[i].index!, sections[i+1]?.index ?? raw.length);
      for (const match of part.matchAll(/class="[^"]*fomc-meeting__month[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?class="[^"]*fomc-meeting__date[^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
        const month = months.indexOf(plainText(match[1])), days = plainText(match[2]).match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\*?$/);
        if (month >= 0 && days) add("FOMC meeting · final day", dateOnly(Number(sections[i][1]),month+1,Number(days[2] ?? days[1])), true, "rates");
      }
    }
  } else if (source.id === "ecb-calendar") {
    for (const match of raw.matchAll(/<dt[^>]*>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
      if (/monetary policy meeting/i.test(match[4]) && /Day 2/i.test(match[4]) && !/non-monetary/i.test(match[4])) add("ECB monetary policy meeting · final day", dateOnly(Number(match[3]),Number(match[2]),Number(match[1])), true, "rates");
    }
  }
  if (!result.length) throw new Error("No recognizable calendar entries");
  return result;
}

export function selectBrief(cache: BriefCache | null, now = new Date()): DailyBrief {
  const time = now.getTime(), today = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  // Seven Rome calendar dates, including today; not 168 hours across DST.
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate()+6);
  const window = { start: today, end: end.toISOString().slice(0,10) };
  const sources = cache?.sources ?? [], seen = new Set<string>();
  const stories = sources.flatMap(source => source.stories).filter(story => {
    const age = time-Date.parse(story.publishedAt); return age >= 0 && age <= 24*HOUR;
  }).sort((a,b) => b.score-a.score || b.publishedAt.localeCompare(a.publishedAt)).filter(story => {
    const key = `${story.event}:${story.publishedAt.slice(0,10)}`;
    if (seen.has(key) || seen.has(story.url)) return false;
    seen.add(key); seen.add(story.url); return true;
  }).slice(0,2);
  const eventKeys = new Set<string>();
  const events = sources.flatMap(source => source.events).filter(event => {
    const timeAt = Date.parse(event.dateOnly ? event.at+"T23:59:59Z" : event.at);
    const current = briefEventDay(event) >= today; // Keep today's release after its scheduled time until midnight.
    // Don't retain a calendar indefinitely when its source stops working.
    const source = sources.find(item => item.id === event.sourceId);
    const recent = source?.lastSuccessAt && time-Date.parse(source.lastSuccessAt) < 7*24*HOUR;
    const key = `${event.sourceId}:${event.topic}:${event.at}`;
    const day = briefEventDay(event);
    if (!current || !recent || day < window.start || day > window.end || eventKeys.has(key)) return false;
    eventKeys.add(key); return true;
  }).sort((a,b) => briefEventDay(a).localeCompare(briefEventDay(b)) || a.at.localeCompare(b.at));
  const releaseWindow=events.some(event=>!event.dateOnly && Math.abs(Date.parse(event.at)-time)<3*HOUR);
  const refreshAfterSeconds=releaseWindow || sources.some(source=>source.error) ? 300 : 5400;
  const coveredEvent = (event: BriefEvent,story: BriefStory) => ({"fred-jobs":"us-employment","fred-cpi":"us-cpi","bea-calendar":event.topic==="growth"?"us-gdp":"us-pce","fed-calendar":"fed-policy","ecb-calendar":"ecb-policy"} as Record<string,string>)[event.sourceId]===story.event;
  const focusEvents=events.filter(event=>briefEventDay(event)===today && !stories.some(story=>coveredEvent(event,story) && Date.parse(story.publishedAt)>=Date.parse(event.at))).sort((a,b)=>Number(b.topic==="employment")-Number(a.topic==="employment") || a.at.localeCompare(b.at)).slice(0,2);
  return { checkedAt: cache?.checkedAt ?? null, stale: !cache || briefSources.some(source=>!sources.some(state=>state.id===source.id)) || time-Date.parse(cache.checkedAt) >= refreshAfterSeconds*1000 || !sources.some(source => source.lastSuccessAt && time-Date.parse(source.lastSuccessAt) < refreshAfterSeconds*1000), stories, events, focusEvents, refreshAfterSeconds, window,
    sources: sources.map(({id,checkedAt,lastSuccessAt,error}) => ({id,checkedAt,lastSuccessAt,error})) };
}

export const briefContext: Record<BriefTopic, {zh:string;en:string;labelZh:string;labelEn:string}> = {
  employment: { labelZh:"美国就业",labelEn:"US employment",zh:"看非农新增、失业率、时薪与前值修订。就业强弱会影响降息预期；不把委托预测当实际结果。",en:"Watch payroll growth, unemployment, wages and prior-month revisions. Jobs affect rate expectations; forecasts are not actual releases." },
  rates: { labelZh:"利率决策",labelEn:"Monetary policy",zh:"关注利率路径与政策措辞；会影响折现率、美元和风险偏好，不等同于确定的涨跌。",en:"Watch the rate path and policy wording: discount rates, the dollar and risk appetite may respond. Direction is not guaranteed." },
  inflation: { labelZh:"收入与通胀",labelEn:"Income & inflation",zh:"关注 PCE 物价、核心 PCE 与消费支出；支出增速不等于通胀率。点击原文查看本次数据。",en:"Check PCE prices, core PCE and spending separately. Spending growth is not inflation. Open the release for the actual figures." },
  growth: { labelZh:"经济增长",labelEn:"Economic growth",zh:"关注实际 GDP、消费与修订幅度；增长和利率预期可能向不同方向变化。",en:"Watch real GDP, consumption and revisions. Growth expectations and rate expectations can move in different directions." },
  earnings: { labelZh:"公司业绩",labelEn:"Earnings",zh:"重点核对营收、利润率、现金流与指引；公司公告不是独立投资建议。",en:"Check revenue, margins, cash flow and guidance. Company releases are not independent investment advice." },
  company: { labelZh:"公司动态",labelEn:"Company development",zh:"区分已确认事实与公司预期，关注落地时间和财务影响，勿把公告自动视为利好。",en:"Separate confirmed facts from company expectations; check timing and financial impact rather than assuming good news." },
};
