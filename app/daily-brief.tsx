"use client";

import { useEffect, useRef, useState } from "react";
import { briefContext, briefEventDay, briefEventHeading, briefStoryHeading, briefSources, type BriefEvent, type DailyBrief as Brief } from "../lib/daily-brief";
import type { Language } from "../lib/i18n";

export function DailyBrief({ language }: { language: Language }) {
  const en = language === "en", [data,setData] = useState<Brief | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState(false);
  const [cooldown,setCooldown] = useState(0), mounted = useRef(false), running = useRef(false);
  const [outcome,setOutcome] = useState<"updated" | "unchanged" | "cooldown" | null>(null);
  const text = (zh: string, english: string) => en ? english : zh;
  async function load(refresh = false, manual = false) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(false);
    try {
      const response = await fetch("/api/daily-brief", refresh ? { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({trigger:manual ? "MANUAL" : "STALE_OPEN"}), signal:AbortSignal.timeout(25_000) } : { cache:"no-store", signal:AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Unavailable");
      const result = await response.json() as Brief;
      if (!mounted.current) return;
      setData(result);
      if (refresh && manual) {
        setCooldown(Math.min(30,result.retryAfterSeconds ?? 30));
        setOutcome(result.refreshing ? null : result.refreshed ? result.newStoryCount ? "updated" : "unchanged" : "cooldown");
      }
      if (!refresh && result.stale) { running.current=false; await load(true); }
    } catch { if (mounted.current) setError(true); }
    finally { running.current=false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current=true; void load();
    const resume = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(resume,60_000);
    document.addEventListener("visibilitychange",resume);
    window.addEventListener("pageshow",resume);
    window.addEventListener("online",resume);
    return () => { mounted.current=false; clearInterval(timer); document.removeEventListener("visibilitychange",resume); window.removeEventListener("pageshow",resume); window.removeEventListener("online",resume); };
  }, []);
  useEffect(() => { if (!cooldown) return; const id=setTimeout(()=>setCooldown(value=>Math.max(0,value-1)),1000); return ()=>clearTimeout(id); },[cooldown]);
  // Re-read when another browser/cron held the lease; never retry-refresh in a loop.
  useEffect(() => { if (!data?.refreshing) return; const id=setTimeout(()=>void load(),15_000); return ()=>clearTimeout(id); },[data]);
  const date = (at: string, dateOnly = false) => new Intl.DateTimeFormat(en ? "en-GB" : "zh-CN", { timeZone:"Europe/Rome", month:"short", day:"numeric", ...(dateOnly ? {} : { hour:"2-digit", minute:"2-digit" }) }).format(new Date(dateOnly ? `${at}T12:00:00Z` : at));
  const failed = data?.sources.filter(source=>source.error).length ?? 0;
  const eventDays = new Map<string, BriefEvent[]>();
  for (const event of data?.events ?? []) {
    const day = briefEventDay(event);
    eventDays.set(day, [...(eventDays.get(day) ?? []), event]);
  }
  const focus = data?.focusEvents ?? [];
  const visibleStories = data?.stories.filter(story=>!focus.some(event=>event.sourceId==="fred-jobs" && story.event==="us-employment")).slice(0,2-focus.length) ?? [];
  const eventTitle = (event: BriefEvent) => briefEventHeading(event,en);
  return <section className="daily-brief" aria-labelledby="daily-brief-title" data-no-translate>
    <header className="brief-heading">
      <div><span className="brief-eyebrow"><i aria-hidden="true" />ALPHA / DAILY</span><h2 id="daily-brief-title">{text("今天，先看这两件事", "Today's essentials")}</h2><p>{text("重大数据与政策优先。最多两条，日期与来源可核对。", "Key data and policy first. At most two highlights, with dates and sources.")}</p></div>
      <button className="secondary-button brief-refresh" type="button" onClick={()=>void load(true,true)} disabled={busy || cooldown>0} aria-label={text("刷新财经简报", "Refresh daily brief")}>{busy ? text("更新中…","Updating…") : cooldown ? text(`${cooldown}秒后可刷新`, `Refresh in ${cooldown}s`) : text("刷新简报","Refresh brief")}</button>
    </header>
    <div className="brief-status" role="status" aria-live="polite">
      {error ? text("更新失败，保留上次内容。请稍后重试。", "Update failed. Previous content preserved; try again.") : !data ? text("读取重点…", "Loading highlights…") : busy || data.refreshing ? text("核对来源中…", "Checking sources…") : failed ? text(`${failed} 个来源不可用，覆盖不完整。`, `${failed} sources unavailable; coverage incomplete.`) : data.stale ? text("内容已过期，请刷新重试。", "Coverage is out of date. Refresh to retry.") : outcome === "unchanged" ? text("已检查，暂无新的重要报道。", "Checked. No new significant report.") : outcome === "updated" ? text("重点已更新。", "Highlights updated.") : outcome === "cooldown" ? text("刚刚已检查，冷却后可重刷。", "Recently checked. Retry after the cooldown.") : text("官方日程 + 可信媒体报道 · 非买卖建议", "Official calendars + attributed media reports · Not trading advice")}
    </div>
    <div className="brief-grid">
      <div className="brief-stories">
        {focus.map((event,index)=>{ const elapsed=!event.dateOnly && Date.parse(event.at)<=Date.now();return <article className="brief-story brief-today" key={`${event.sourceId}-${event.at}`}>
          <div className="brief-story-meta"><span className="brief-number">0{index+1}</span><span className="brief-today-label">{text("今日重点", "TODAY")}</span><time dateTime={event.at}>{date(event.at,event.dateOnly)}</time></div>
          <h3><a href={event.url} target="_blank" rel="noopener noreferrer">{eventTitle(event)}</a></h3>
          <p className="brief-release-state">{elapsed ? text("已到计划发布时间 · 等待可信结果，未确认实际数字", "Scheduled time passed · Awaiting verified figures") : text("待发布 · 不是已公布结果", "Scheduled · Not a released result")}</p>
          <p>{event.sourceId==="fred-jobs" ? text("看非农新增、失业率、时薪及前值修订；重点是对降息预期的影响。", "Watch payrolls, unemployment, wages and revisions — especially implications for rate expectations.") : en ? briefContext[event.topic].en : briefContext[event.topic].zh}</p>
          <a className="brief-source-link" href={event.url} target="_blank" rel="noopener noreferrer">{briefSources.find(source=>source.id===event.sourceId)?.label} · {data?.sources.find(source=>source.id===event.sourceId)?.error ? text("缓存日程 · 同步暂不可用", "Cached schedule · Sync unavailable") : text("核对日程", "Check schedule")}</a>
        </article>;})}
        {visibleStories.map((story,index) => { const context = briefContext[story.topic], source = briefSources.find(item=>item.id===story.sourceId); const cached=data?.sources.find(item=>item.id===story.sourceId)?.error;
          return <article className="brief-story" key={story.url}>
            <div className="brief-story-meta"><span className="brief-number">0{index+focus.length+1}</span><span>{en ? context.labelEn : context.labelZh}</span><time dateTime={story.publishedAt}>{text("发布 ","Published ")}{date(story.publishedAt)}</time>{cached ? <span>{text("缓存","Cached")}</span> : null}</div>
            <h3><a href={story.url} target="_blank" rel="noopener noreferrer">{briefStoryHeading(story,en)}</a></h3>
            <details className="brief-excerpt"><summary>{text("公告原文与关注点", "Release & watch-points")}</summary><div className="brief-release-detail"><strong lang="en">{story.title}</strong>{story.excerpt ? <p lang="en">{story.excerpt}</p> : null}<p className="brief-watch"><span>{text("关注点 · 通用说明", "Watch-points · general context")}</span>{en ? context.en : context.zh}</p></div></details>
            <a className="brief-source-link" href={story.url} target="_blank" rel="noopener noreferrer">{story.publisher ?? source?.label} · {text("阅读来源","Read source")}</a>
          </article>;
        })}
        {data && !focus.length && !visibleStories.length ? <div className="brief-empty"><strong>{text("暂无已核实的重点", "No verified highlights yet")}</strong><p>{text("不拿旧闻或宣传凑满两条。覆盖可能不完整，请查看来源状态。", "No old news or promotions to fill two slots. Coverage may be incomplete; check source status.")}</p></div> : null}
      </div>
      <aside className="brief-calendar" aria-labelledby="brief-calendar-title"><header><h3 id="brief-calendar-title">{text("未来七天", "Next seven days")}</h3><span>Europe/Rome</span></header>
        {data?.window ? <p className="brief-window"><time dateTime={data.window.start}>{date(data.window.start,true)}</time><span>—</span><time dateTime={data.window.end}>{date(data.window.end,true)}</time><small>{text("含今天 · 每天滚动", "Including today · rolling daily")}</small></p> : null}
        {eventDays.size ? <ol>{[...eventDays].map(([day,events])=><li className="brief-calendar-day" key={day}>
          <time dateTime={day}>{date(day,true)}</time>
          <ul>{events.map(event=><li className="brief-calendar-event" key={`${event.sourceId}-${event.at}-${event.topic}`}>
            <a href={event.url} target="_blank" rel="noopener noreferrer">{eventTitle(event)}</a>
            <small>{event.dateOnly ? text("时间待官方公布", "Time not specified") : <time dateTime={event.at}>{new Intl.DateTimeFormat(en ? "en-GB" : "zh-CN",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(event.at))} · Rome</time>}{data?.sources.find(source=>source.id===event.sourceId)?.error ? text(" · 缓存日期", " · Cached date") : ""}</small>
          </li>)}</ul>
        </li>)}</ol> : <p className="brief-calendar-empty">{text("这七天内，已连接来源暂无已核实的发布日程。不会展示更远的日期来填满。", "No verified releases within these seven days from connected sources. Later dates stay out of this view.")}</p>}
        <p className="brief-calendar-note">{text("覆盖非农就业、CPI、初请、Fed、ECB、GDP、PCE。时间为计划发布时间，不代表结果已取得。", "Payrolls, CPI, jobless claims, Fed, ECB, GDP and PCE. Times are scheduled releases, not confirmation of results.")}</p>
      </aside>
    </div>
    <footer className="brief-footer"><span>{data?.checkedAt ? text(`最近检查 ${date(data.checkedAt)} · 罗马时间`, `Last checked ${date(data.checkedAt)} · Rome`) : text("等待首次更新", "Awaiting first update")}</span><details><summary>{text("来源与筛选方式", "Sources & selection")}</summary><p>{text("最多两条：今天的重大数据优先，再选近 24 小时的重要公告或可信媒体报道。官方日程通过 Fed、ECB、BEA、FRED 核对；媒体标题经 Google News RSS 读取，仅收录指定主流媒体，保留署名，不当成官方实际值。七天日程含今天；重要发布前后 3 小时内每 5 分钟补刷，其余正常来源 90 分钟，手动冷却 30 秒。网页可见时自动检查，后台仍沿用现有定时更新。不是毫秒级新闻终端；日程和报道可能滞后或不完整。持仓不会发送给来源。", "At most two highlights: today's major releases first, then significant announcements or attributed major-publisher reports from the last 24 hours. Official calendars via Fed, ECB, BEA and FRED; selected publisher headlines via Google News RSS, not official actual figures. Seven days including today. Refresh every five minutes within three hours of a release; normally 90 minutes, manual cooldown 30 seconds. Checks on visibility; existing scheduled updates continue. Not a real-time news terminal; feeds may lag or be incomplete. Holdings are never sent to sources.")}</p><ul>{briefSources.map(source=>{const state=data?.sources.find(item=>item.id===source.id);return <li key={source.id}><a href={source.home} target="_blank" rel="noopener noreferrer">{source.label}</a><span>{state?.error ? text("暂不可用", "Unavailable") : state?.lastSuccessAt ? text("已连接", "Connected") : text("待检查", "Not checked")}{state?.lastSuccessAt ? ` · ${date(state.lastSuccessAt)}` : ""}</span></li>;})}</ul></details></footer>
  </section>;
}
