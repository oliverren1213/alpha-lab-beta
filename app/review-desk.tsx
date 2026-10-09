"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DecisionReview, LabData } from "../lib/types";
import { dateInRome } from "../lib/schedule";
import { periodInsights, weeklyDraft } from "../lib/insights";
import { confirmUi } from "../lib/i18n";

const assessments: Record<string, string> = { SUPPORTED: "有事实支持", UNCLEAR: "证据仍不足", WEAKENED: "理由有所减弱", INVALIDATED: "原判断已失效" };
const sizes: Record<string, string> = { APPROPRIATE: "符合计划", TOO_LARGE: "仓位过大", TOO_SMALL: "仓位过小", UNCLEAR: "暂不确定" };

export function ReviewDesk({ data, reload }: { data: LabData; reload: () => Promise<LabData> }) {
  const [filter, setFilter] = useState("due");
  const today = dateInRome();
  const all = data.reviews ?? [];
  const due = all.filter((review) => !review.completedAt && review.dueAt <= today);
  const rows = all.filter((review) => filter === "done" ? Boolean(review.completedAt) : filter === "next" ? !review.completedAt && review.dueAt > today : !review.completedAt && review.dueAt <= today);
  return <section className="review-desk analysis-section">
    <header className="section-heading"><span className="preview-eyebrow">DECISION JOURNAL</span><h2>回到当初的判断</h2><p>先核对事实，再评价判断、仓位与执行。短期涨跌不是唯一成绩单。</p></header>
    <div className="review-tabs" aria-label="复盘筛选">{[["due", `待复盘 · ${due.length}`], ["next", "即将到期"], ["done", "已完成"]].map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
    {!rows.length ? <p className="inline-empty">{filter === "due" ? "目前没有到期复盘。建立投资逻辑后，会安排 7、30、90 天的回顾。" : "此分类暂无记录。"}</p> : <div className="review-list">{rows.map((review) => <ReviewCard key={review.id} review={review} data={data} reload={reload} />)}</div>}
  </section>;
}

function ReviewCard({ review, data, reload }: { review: DecisionReview; data: LabData; reload: () => Promise<LabData> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const thesis = data.theses.find((item) => item.id === review.thesisId);
  const original = thesis ? [...thesis.revisions,thesis.revision].sort((a,b)=>a.revisedAt.localeCompare(b.revisedAt))[0] : undefined;
  const end = review.completedAt?.slice(0,10) ?? dateInRome();
  const start = thesis?.openedAt.slice(0,10) ?? "";
  const trades = data.transactions.filter((item) => item.assetId === thesis?.assetId && item.tradedAt.slice(0, 10) >= start && item.tradedAt.slice(0, 10) <= end);
  const performance = useMemo(() => {
    if (!thesis || !start || start > end) return null;
    try { return periodInsights({...data,transactions:data.transactions.filter(t=>t.assetId===thesis.assetId)},start,end); }
    catch { return null; }
  }, [data,thesis,start,end]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/reviews/${review.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error);
      await reload().catch(() => setError("复盘已保存，请刷新页面重新读取。"));
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败，请重试"); }
    finally { setBusy(false); }
  }
  return <details className="review-card" open={!review.completedAt && review.dueAt <= dateInRome()}>
    <summary><div><strong>{thesis?.symbol ?? "投资逻辑"}</strong><span>{`${review.horizonDays} 天复盘`}</span></div><small>{review.completedAt ? "已完成" : review.dueAt}</small></summary>
    <div className="review-body"><div className="review-comparison"><section><span>当初的理由</span><p data-no-translate>{review.expectation || original?.buyReason}</p><small>失效条件</small><p data-no-translate>{original?.invalidation}</p></section><section><span>之后的记录</span><p>{`${trades.length} 笔交易 · ${thesis?.revisions.length ?? 0} 个判断版本`}</p><small>最新判断</small><p data-no-translate>{thesis?.revision.buyReason}</p></section></div>
      {performance?<div className="review-performance"><span>这段时间的账本损益 · USD</span><strong>{performance.pnl==null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",signDisplay:"exceptZero"}).format(performance.pnl)}</strong><small>{start} → {end} · {performance.carried?"沿用最近有效价格":"边界价格齐全"}</small><p>按当前账本与加权平均成本回算，含已实现收益、股息及费用；缺少边界价格时留空，不代表判断本身的好坏。</p></div>:null}
      {review.completedAt ? <div className="completed-review"><strong>{assessments[review.assessment]} · {sizes[review.sizing]}</strong><p data-no-translate>{review.actual}</p><p data-no-translate>{review.lesson}</p></div> : <form className="review-form" onSubmit={submit}>
        <label className="field wide"><span>发生了什么？哪些事实支持或反驳了原判断？</span><textarea name="actual" required maxLength={4000} defaultValue={review.actual} /></label>
        <label className="field"><span>判断结果</span><select name="assessment" defaultValue="UNCLEAR">{Object.entries(assessments).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field"><span>仓位是否合适</span><select name="sizing" defaultValue="UNCLEAR">{Object.entries(sizes).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field wide"><span>下次会怎么做</span><textarea name="lesson" maxLength={4000} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}<button type="submit" className="primary-button" disabled={busy}>{busy ? "保存中" : "完成这次复盘"}</button>
      </form>}
    </div>
  </details>;
}

export function WeeklyNoteEditor({ data, reload, language = "zh" }: { data: LabData; reload: () => Promise<LabData>; language?: "en" | "zh" }) {
  const date = new Date(dateInRome() + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const currentWeek = date.toISOString().slice(0, 10);
  const [week, setWeek] = useState(currentWeek);
  const saved = data.weeklyNotes?.find((note) => note.week === week);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const [replacement,setReplacement]=useState<{week:string;text:string}|null>(null);
  function generateDraft() {
    const existing = drafts[week] ?? saved?.text ?? "";
    try { const text=weeklyDraft(data,week,dateInRome(),language);if(existing.trim()){setReplacement({week,text});return;}setDrafts(current=>({...current,[week]:text})); setMessage(language === "en" ? "Draft ready. Review, edit, then save." : "草稿已生成，请编辑确认后保存。 "); }
    catch { setMessage(language === "en" ? "Unable to draft this period. Check ledger dates and data." : "此区间无法生成草稿，请核对账本日期与数据。"); }
  }
  const dirty = Object.entries(drafts).some(([id,text]) => text !== (data.weeklyNotes?.find((note) => note.week === id)?.text ?? ""));
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigate = (event: Event) => { if (!confirmUi("备忘还未保存，确认离开并放弃修改？")) event.preventDefault(); };
    window.addEventListener("beforeunload",beforeUnload);
    window.addEventListener("alpha-before-navigate",beforeNavigate);
    return () => { window.removeEventListener("beforeunload",beforeUnload); window.removeEventListener("alpha-before-navigate",beforeNavigate); };
  }, [dirty]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const text = String(new FormData(event.currentTarget).get("text") ?? "");
    try {
      const response = await fetch("/api/weekly-note", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ week, text, expectedUpdatedAt: saved?.updatedAt ?? null }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error);
      try {
        await reload();
        setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== week)));
        setMessage("已保存到私人账本");
      } catch { setMessage("备忘已保存，请刷新页面重新读取。"); }
    } catch (err) { setMessage(err instanceof Error ? err.message : "保存失败，内容仍保留在此"); }
    finally { setBusy(false); }
  }
  return <section className="weekly-editor"><header><h3>我的本周判断</h3><select aria-label="查看每周备忘" value={week} onChange={(event) => { setWeek(event.target.value); setMessage(""); }}>{[...new Set([currentWeek, ...(data.weeklyNotes ?? []).map((note) => note.week)])].sort().reverse().map((item) => <option key={item} value={item}>{item}</option>)}</select></header>
    <div className="draft-intro" data-no-translate><p>{language === "en" ? "Start with the selected week's actual trades and returns, then add your judgment. Existing notes are preserved until you confirm and save." : "先整理所选周的真实交易与收益，再补上你的判断。确认保存前，不会覆盖已有备忘。"}</p><button type="button" className="secondary-button" disabled={busy} onClick={generateDraft}>{language === "en" ? "Draft from my ledger" : "从账本生成草稿"}</button></div>
    {replacement?.week===week?<div className="draft-replacement" data-no-translate><p>{language==="en"?"The editor contains text. Replace it with this draft? Saved notes remain unchanged until you save.":"编辑框已有内容，要用草稿替换吗？再次保存前，已保存的备忘不变。"}</p><button type="button" className="secondary-button" onClick={()=>{setDrafts(current=>({...current,[week]:replacement.text}));setReplacement(null);}}>{language==="en"?"Replace editor text":"替换编辑框内容"}</button><button type="button" className="text-button" onClick={()=>setReplacement(null)}>{language==="en"?"Keep my text":"保留我的文字"}</button></div>:null}
    <form key={week} onSubmit={save}><label className="field"><span>本周学到什么，下周要验证什么</span><textarea name="text" rows={7} maxLength={12000} value={drafts[week] ?? saved?.text ?? ""} onChange={(event) => setDrafts((current) => ({...current,[week]:event.target.value}))} placeholder="哪些事实改变了你的判断？有哪些事情值得等待，而不是交易？" /></label><div className="memo-toolbar"><button type="submit" className="primary-button" disabled={busy}>{busy ? "保存中" : "保存备忘"}</button><span role="status">{message || (saved ? `已保存 ${saved.updatedAt.slice(0, 10)}` : "尚未保存")}</span></div></form>
  </section>;
}
