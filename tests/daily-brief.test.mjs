import assert from "node:assert/strict";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";

// Synthetic fixtures are confined to this in-memory database, never the app.
const sqlite = new DatabaseSync(":memory:");
for (const file of ["0000_freezing_night_thrasher.sql","0001_sloppy_luminals.sql"]) sqlite.exec(await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8"));
const adapter = { prepare(sql) { let args=[]; return { bind(...values){args=values;return this;}, async first(){return sqlite.prepare(sql).get(...args)??null;}, async all(){return {results:sqlite.prepare(sql).all(...args)};}, async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};} }; },async batch(items){return Promise.all(items.map(item=>item.run()));} };
globalThis.__briefTestEnv={DB:adapter};
const vite=await createServer({configFile:false,appType:"custom",logLevel:"silent",server:{middlewareMode:true},plugins:[{name:"workers-brief-test",resolveId(id){if(id==="cloudflare:workers")return "\0brief-workers";},load(id){if(id==="\0brief-workers")return "export const env=globalThis.__briefTestEnv";}}]});
after(async()=>{await vite.close();sqlite.close();delete globalThis.__briefTestEnv;});
const {briefSources,parseStories,parseCalendar,selectBrief,briefEventDay,briefStoryHeading,centralReleaseTime}=await vite.ssrLoadModule("/lib/daily-brief.ts");
const {refreshDailyBrief,readDailyBrief}=await vite.ssrLoadModule("/lib/daily-brief-store.ts");
const source=id=>briefSources.find(item=>item.id===id);
const now=new Date();
const item=(title,url,date=now.toUTCString())=>`<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate></item>`;
const rss=body=>`<rss version="2.0"><channel>${body}</channel></rss>`;
const fredFixture=(rid="50",day="Friday October 02, 2026")=>`<div id="release-dates-pager"><tbody><tr><td>${day}</td></tr><tr><td>7:30 am</td><td><a href="/release?rid=${rid}">Employment Situation</a></td></tr></tbody></div>All times are US Central Time`;
const fixture=id=> id.startsWith("fred-") ? fredFixture(new URL(source(id).url).searchParams.get("rid")) : id==="bea-calendar" ? `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Personal Income and Outlays\\,\n October 2026\nDTSTART:20261125T133000Z\nEND:VEVENT\nEND:VCALENDAR` : id==="fed-calendar" ? `<h4>2026 FOMC Meetings</h4><div class="fomc-meeting__month"><strong>October</strong></div><div class="fomc-meeting__date">27-28*</div>` : id==="ecb-calendar" ? `<dt>29/10/2026</dt><dd>Governing Council monetary policy meeting (Day 2)</dd><dt>28/10/2026</dt><dd>monetary policy meeting (Day 1)</dd>` : id==="bea" ? rss(item("Personal Income and Outlays, August 2026","https://www.bea.gov/news/fixture")) : rss("");
const canonical=url=>{const u=new URL(url);u.searchParams.delete("vs");u.searchParams.delete("ve");return u.origin+u.pathname+"?"+u.searchParams.toString();};
const sourceForUrl=url=>briefSources.find(s=>canonical(s.url)===canonical(url));
const calendarFeeds=Object.fromEntries(briefSources.filter(s=>s.id.startsWith("fred-")).map(s=>[s.id,fixture(s.id)]));
const networkCount=briefSources.length-Object.keys(calendarFeeds).length;

test("news retains facts, rejects unsafe URLs and irrelevant promotions, deduplicates and expires",()=>{
  const news=parseStories(rss(item("Federal Reserve issues FOMC statement","https://www.federalreserve.gov/a")+item("Federal Reserve releases economic projections","https://www.federalreserve.gov/b")+item("FOMC statement","javascript:alert(1)")+item("FOMC statement","https://www.federalreserve.gov.evil.example/a")+item("FOMC statement","https://www.federalreserve.gov/future",new Date(now.getTime()+3600000).toUTCString())),source("fed"));
  assert.equal(news.length,3);
  assert.equal(parseStories(rss(item("Graduate fellowship programme","https://nvidianews.nvidia.com/a")),source("nvidia")).length,0);
  const cache={version:1,checkedAt:now.toISOString(),sources:[{id:"fed",checkedAt:now.toISOString(),lastSuccessAt:now.toISOString(),error:null,stories:news,events:[]}]};
  assert.equal(selectBrief(cache,now).stories.length,1);
  assert.match(selectBrief(cache,now).stories[0].title,/statement/);
  assert.equal(selectBrief(cache,new Date(now.getTime()+77*3600000)).stories.length,0);
  assert.throws(()=>parseStories("<html>Unavailable</html>",source("fed")));
});
test("official calendar handles folded ICS, final meeting days and Rome DST",()=>{
  const bea=parseCalendar(fixture("bea-calendar"),source("bea-calendar"));
  assert.equal(bea[0].title,"Personal Income and Outlays,October 2026");
  assert.equal(bea[0].at,"2026-11-25T13:30:00Z");
  assert.equal(parseCalendar(fixture("fed-calendar"),source("fed-calendar"))[0].at,"2026-10-28");
  assert.equal(parseCalendar(fixture("ecb-calendar"),source("ecb-calendar")).length,1);
  const format=at=>new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit"}).format(new Date(at));
  assert.equal(format("2026-10-29T12:30:00Z"),"13:30");
  assert.equal(format(bea[0].at),"14:30");
  const modern="BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:GDP (Advance Estimate), 3rd Quarter 2026\nDTSTART:20261029T123000Z\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:GDP by County, 2025\nDTSTART:20261202T133000Z\nEND:VEVENT\nEND:VCALENDAR";
  const gdp=parseCalendar(modern,source("bea-calendar"));
  assert.equal(gdp.length,1);assert.equal(gdp[0].topic,"growth");assert.equal(gdp[0].at,"2026-10-29T12:30:00Z");
  assert.throws(()=>parseCalendar("<html>Unexpected format</html>",source("fed-calendar")));
});
test("selection limits two stories and seven Rome dates, retains simultaneous releases and expires calendars",()=>{
  const stamp="2026-09-30T18:00:00Z", news=Array.from({length:5},(_,i)=>({title:`Fixture ${i}`,url:`https://www.bea.gov/${i}`,publishedAt:stamp,score:90,topic:"growth",event:`event${i}`,sourceId:"bea"}));
  const events=Array.from({length:5},(_,i)=>({title:"Fixture event",at:`2026-10-0${i+1}`,dateOnly:true,topic:"rates",sourceId:"bea",url:"https://www.bea.gov/"}));
  const cache={version:1,checkedAt:stamp,sources:[{id:"bea",checkedAt:stamp,lastSuccessAt:stamp,error:null,stories:news,events}]};
  const result=selectBrief(cache,new Date(stamp));assert.equal(result.stories.length,2);assert.equal(result.events.length,5);assert.equal(result.stale,true); // new sources are missing from this fixture
  assert.deepEqual(result.window,{start:"2026-09-30",end:"2026-10-06"});
  cache.sources[0].events.push({...events[1],topic:"growth",at:"2026-10-02T12:30:00Z",dateOnly:false});
  cache.sources[0].events.push({...events[1],topic:"inflation",at:"2026-10-02T12:30:00Z",dateOnly:false});
  const grouped=selectBrief(cache,new Date(stamp));
  assert.equal(grouped.events.length,7);
  assert.deepEqual([...new Set(grouped.events.map(briefEventDay))],["2026-10-01","2026-10-02","2026-10-03","2026-10-04","2026-10-05"]);
  assert.equal(briefEventDay({...events[0],dateOnly:false,at:"2026-09-30T22:30:00Z"}),"2026-10-01");
  assert.equal(briefStoryHeading({...news[0],event:"us-pce",title:"Personal Income and Outlays, August 2026"},true),"US income, spending & PCE · August 2026");
  assert.equal(briefStoryHeading({...news[0],event:"us-gdp",title:"GDP, Third Estimate, 2nd Quarter 2026; State PCE, 2025"},false),"美国 GDP 发布 · 2nd Quarter 2026");
  assert.equal(selectBrief(cache,new Date("2026-10-08T18:00:00Z")).events.length,0);
});
test("seven-day window handles Rome midnight, month/year rollover and DST",()=>{
  for (const [stamp,start,end] of [["2026-09-30T22:30:00Z","2026-10-01","2026-10-07"],["2026-10-24T22:30:00Z","2026-10-25","2026-10-31"],["2026-12-29T12:00:00Z","2026-12-29","2027-01-04"]]) {
    const events=[{at:start,dateOnly:true},{at:end,dateOnly:true},{at:new Date(Date.parse(end+"T12:00:00Z")+86400000).toISOString().slice(0,10),dateOnly:true},{at:stamp,dateOnly:false}].map(e=>({...e,title:"Fixture",topic:"rates",sourceId:"fed-calendar",url:"https://www.federalreserve.gov/"}));
    const cache={version:1,checkedAt:stamp,sources:[{id:"fed-calendar",checkedAt:stamp,lastSuccessAt:stamp,error:null,stories:[],events}]};
    const result=selectBrief(cache,new Date(stamp));
    assert.deepEqual(result.window,{start,end});assert.equal(result.events.length,3);
    assert.ok(result.events.every(e=>briefEventDay(e)>=start&&briefEventDay(e)<=end));
  }
});
const persistedShape=({refreshed,newStoryCount,refreshing,retryAfterSeconds,...data})=>data;
test("refresh persists, re-reads, respects cooldown, and preserves still-valid data on source failure",async()=>{
  let requests=0;
  const fetcher=async url=>{requests++;const s=sourceForUrl(url);return new Response(fixture(s.id));};
  const first=await refreshDailyBrief("CRON",fetcher,now,calendarFeeds);
  assert.equal(requests,networkCount);assert.equal(first.stories.length,1);assert.ok(first.sources.every(s=>!s.error));
  assert.equal(first.refreshed,true);assert.equal(first.newStoryCount,1);
  assert.deepEqual(await readDailyBrief(now),persistedShape(first));
  await refreshDailyBrief("MANUAL",fetcher,now);assert.equal(requests,networkCount);
  const rechecked=await refreshDailyBrief("MANUAL",fetcher,new Date(now.getTime()+31_000));
  assert.equal(requests,networkCount*2);assert.equal(rechecked.refreshed,true);assert.equal(rechecked.newStoryCount,0);
  assert.equal(rechecked.sources.find(s=>s.id==="fred-jobs").lastSuccessAt,first.checkedAt);
  const later=new Date(now.getTime()+91*60000);
  const failed=await refreshDailyBrief("STALE_OPEN",async()=>new Response("Unavailable",{status:503}),later);
  assert.equal(failed.stories[0].title,first.stories[0].title);assert.ok(failed.sources.filter(s=>!s.id.startsWith("fred-")).every(s=>s.error==="HTTP 503"));assert.equal(failed.sources[0].lastSuccessAt,rechecked.checkedAt);
  assert.equal(failed.sources.find(s=>s.id==="fred-jobs").lastSuccessAt,first.checkedAt);
  assert.equal(failed.stale,true);
  assert.deepEqual(await readDailyBrief(later),persistedShape(failed));
  let retried=0;const recovered=await refreshDailyBrief("STALE_OPEN",async url=>{retried++;return fetcher(url);},new Date(later.getTime()+5*60_000));
  assert.equal(retried,networkCount);assert.ok(recovered.sources.every(s=>!s.error));assert.equal(recovered.stale,false);
});
test("protected external calendars persist, expire honestly and reject unrecognizable HTML",async()=>{
  sqlite.prepare("DELETE FROM settings WHERE key LIKE 'daily-brief:%'").run();
  const fetcher=async url=>new Response(fixture(sourceForUrl(url).id));
  const first=await refreshDailyBrief("CRON",fetcher,now,calendarFeeds);
  assert.deepEqual(await readDailyBrief(now),persistedShape(first));
  const later=new Date(now.getTime()+19*3600_000);
  const expired=await refreshDailyBrief("MANUAL",async url=>sourceForUrl(url).id.startsWith("fred-")?new Response("Unavailable",{status:503}):fetcher(url),later);
  assert.equal(expired.sources.find(s=>s.id==="fred-jobs").error,"HTTP 503");
  assert.equal(expired.sources.find(s=>s.id==="fred-jobs").lastSuccessAt,first.checkedAt);
  const invalid=await refreshDailyBrief("CRON",fetcher,new Date(later.getTime()+31_000),{"fred-jobs":"<html>Denied</html>"});
  assert.ok(invalid.sources.find(s=>s.id==="fred-jobs").error);
  assert.equal(invalid.sources.find(s=>s.id==="fred-jobs").lastSuccessAt,first.checkedAt);
  const fixed=await refreshDailyBrief("CRON",fetcher,new Date(later.getTime()+32_000),calendarFeeds);
  assert.ok(fixed.sources.filter(s=>s.id.startsWith("fred-")).every(s=>!s.error&&s.lastSuccessAt===fixed.checkedAt));
  assert.deepEqual(await readDailyBrief(new Date(later.getTime()+32_000)),persistedShape(fixed));
});
test("redirects stay within official HTTPS hosts and reject external destinations",async()=>{
  sqlite.prepare("DELETE FROM settings WHERE key LIKE 'daily-brief:%'").run();
  let redirects=0;
  const fetcher=async url=>{
    const s=sourceForUrl(url);
    if(s?.id==="fed")return new Response(null,{status:302,headers:{location:"/feeds/moved.xml"}});
    if(url==="https://www.federalreserve.gov/feeds/moved.xml"){redirects++;return new Response(fixture("fed"));}
    if(s?.id==="google")return new Response(null,{status:302,headers:{location:"https://untrusted.example/feed"}});
    assert.notEqual(new URL(url).hostname,"untrusted.example");return new Response(fixture(s.id));
  };
  const result=await refreshDailyBrief("MANUAL",fetcher,now);
  assert.equal(redirects,1);assert.equal(result.sources.find(s=>s.id==="fed").error,null);
  assert.equal(result.sources.find(s=>s.id==="google").error,"Unrecognized feed redirect");
});
test("overlapping updates have one owner and old owners cannot erase a newer lease",async()=>{
  sqlite.prepare("DELETE FROM settings WHERE key LIKE 'daily-brief:%'").run();
  let release;const barrier=new Promise(resolve=>release=resolve);let calls=0;
  const pending=refreshDailyBrief("MANUAL",async url=>{calls++;await barrier;return new Response(fixture(sourceForUrl(url).id));},now);
  while(!calls)await new Promise(resolve=>setTimeout(resolve,1));
  const second=await refreshDailyBrief("MANUAL",async()=>{throw new Error("Must not fetch");},now);assert.equal(second.refreshing,true);
  sqlite.prepare("UPDATE settings SET value='new-owner' WHERE key='daily-brief:lease'").run();
  release();await pending;
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key='daily-brief:lease'").get().value,"new-owner");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='daily-brief:v1'").get().n,0);
});
test("employment stays a today highlight after scheduled time; release window refreshes in five minutes",()=>{
  const events=parseCalendar(fredFixture(),source("fred-jobs"));
  assert.equal(events[0].at,"2026-10-02T12:30:00.000Z");
  assert.equal(centralReleaseTime("2026-10-29",7,30),"2026-10-29T12:30:00.000Z");
  assert.equal(centralReleaseTime("2026-11-06",7,30),"2026-11-06T13:30:00.000Z");
  assert.deepEqual(parseCalendar('<div id="release-dates-pager"><tbody></tbody></div>All times are US Central Time',source("fred-cpi")),[]);
  const stamp="2026-10-02T12:40:00Z";
  const cache={version:1,checkedAt:stamp,sources:briefSources.map(s=>({id:s.id,checkedAt:stamp,lastSuccessAt:stamp,error:null,stories:[],events:s.id==="fred-jobs"?events:[]}))};
  const result=selectBrief(cache,new Date(stamp));
  assert.equal(result.focusEvents[0].sourceId,"fred-jobs");assert.equal(result.refreshAfterSeconds,300);assert.equal(result.stale,false);
  assert.equal(selectBrief(cache,new Date("2026-10-02T12:45:00Z")).stale,true);
});
test("aggregated headlines require an approved publisher and exclude previews, forecasts and unsafe URLs",()=>{
  const news=(title,publisher,url="https://news.google.com/rss/articles/fixture")=>item(title,url)+"";
  const entry=(title,publisher,url)=>news(title,publisher,url).replace("</item>",`<source>${publisher}</source></item>`);
  const raw=rss(entry("US payrolls rise, unemployment holds steady - Reuters","Reuters")+entry("US payrolls preview: expected growth - Reuters","Reuters")+entry("US jobs report shock - Untrusted","Untrusted")+entry("CPI falls - Reuters","Reuters","https://evil.example/"));
  const stories=parseStories(raw,source("market-news"));assert.equal(stories.length,1);assert.equal(stories[0].publisher,"Reuters");assert.equal(stories[0].event,"us-employment");
});
