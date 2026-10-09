"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fromScreenshot, inboxStatuses, matchInboxTrade, parseStatementText, type InboxDocument, type InboxTrade } from "../lib/inbox";
import { readPdfLocally } from "../lib/document-text";
import { recognizeScreenshotLocally } from "../lib/screenshot-import";
import type { LabData } from "../lib/types";
import { feeStatusLabels, type FeeStatus } from "../lib/fee-status";
import { confirmUi } from "../lib/i18n";

export function TransactionInbox({ data, reload }: { data: LabData; reload: () => Promise<LabData> }) {
  const [documents, setDocuments] = useState<InboxDocument[]>([]);
  const [active, setActive] = useState("");
  const [trades, setTrades] = useState<InboxTrade[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [replacements, setReplacements] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const doc = documents.find((item) => item.id === active);
  const dirty = doc?.status === "DRAFT" && JSON.stringify(trades) !== JSON.stringify(doc.trades);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigate = (event: Event) => { if (!confirmUi("请先保存核对进度，或确认放弃未保存修改。")) event.preventDefault(); };
    window.addEventListener("beforeunload",beforeUnload);
    window.addEventListener("alpha-before-navigate",beforeNavigate);
    return () => { window.removeEventListener("beforeunload",beforeUnload); window.removeEventListener("alpha-before-navigate",beforeNavigate); };
  }, [dirty]);
  async function load() {
    const response = await fetch("/api/inbox");
    const result = await response.json() as InboxDocument[] & { error?: string };
    if (!response.ok) throw new Error(result.error);
    setDocuments(result); return result as InboxDocument[];
  }
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/inbox").then(async (response) => {
      const result = await response.json() as InboxDocument[] & { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (!cancelled) setDocuments(result);
    }).catch((err) => { if (!cancelled) setMessage(err.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function open(document: InboxDocument) { setActive(document.id); setTrades(document.trades.map((trade) => ({...trade}))); setSelected(new Set()); setReplacements(new Set()); setMessage(""); }
  async function upload(event: FormEvent<HTMLFormElement>) {
    if (dirty && !confirmUi("请先保存核对进度，或确认放弃未保存修改。")) { event.preventDefault(); return; }
    event.preventDefault(); setBusy(true); setProgress(0); setMessage("");
    try {
      const form = new FormData(event.currentTarget); const file = form.get("document");
      if (!(file instanceof File) || !file.size) throw new Error("请选择文件");
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      let rawText: string; let candidates: InboxTrade[];
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        rawText = await readPdfLocally(file,setProgress);
        candidates = parseStatementText(rawText,data.accounts,data.assets);
      } else {
        const result = await recognizeScreenshotLocally(file,data.accounts,data.assets,setProgress);
        rawText = result.rawText;
        candidates = result.trades.map((trade) => fromScreenshot(trade,rawText,data.assets));
      }
      const response = await fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", document: { filename: file.name, rawText, trades: candidates } }) });
      const result = await response.json() as InboxDocument & { error?: string }; if (!response.ok) throw new Error(result.error);
      await load(); open(result); setMessage(candidates.length ? "候选已保存。请对照原文确认数字，勾选要入账的项目。" : "文字已提取，没有找到明确成交记录。请查看原文并手工录入。");
    } catch (err) { setMessage(err instanceof Error ? err.message : "识别失败，请重试"); }
    finally { setBusy(false); }
  }
  function change(index: number, patch: Partial<InboxTrade>) { setTrades((current) => current.map((item,i) => i === index ? { ...item,...patch } : item)); }
  function toggle(index: number) { setSelected((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; }); }
  async function apply(indices = [...selected]) {
    if (!doc) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply", id: doc.id, confirm: true, selections: indices.map((index) => ({ index,trade: trades[index],replace: replacements.has(index) })) }) });
      const result = await response.json() as { error?: string; changed?: number; skipped?: number }; if (!response.ok) throw new Error(result.error);
      setMessage(`${result.changed ?? 0} 笔已处理，${result.skipped ?? 0} 笔相同记录已跳过。`);
      try {
        const latest = await load(); open(latest.find((item) => item.id === doc.id)!);
        await reload();
        setMessage(`${result.changed ?? 0} 笔已处理，${result.skipped ?? 0} 笔相同记录已跳过。`);
      } catch { setMessage("已写入，请刷新页面重新读取账本。"); }
    } catch (err) { setMessage(err instanceof Error ? err.message : "入账失败，候选仍保留"); }
    finally { setBusy(false); }
  }
  async function undo() {
    if (!doc || !confirmUi("撤销这份文件的入账？新增交易将移除，替换交易将恢复为原记录。")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "undo",id: doc.id,confirm: true }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error);
      try {
        const latest = await load(); open(latest.find((item) => item.id === doc.id)!); await reload();
        setMessage("已撤销这次入账，原记录已恢复。");
      } catch { setMessage("撤销已成功，请刷新页面重新读取账本。"); }
    } catch (err) { setMessage(err instanceof Error ? err.message : "无法撤销"); }
    finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!doc) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "draft", id: doc.id, document: { filename: doc.filename, rawText: doc.rawText, trades } }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error);
      await load(); setMessage("核对进度已保存，可以稍后继续。");
    } catch (err) { setMessage(err instanceof Error ? err.message : "保存失败"); }
    finally { setBusy(false); }
  }
  const matches = trades.map((trade) => matchInboxTrade(trade,data.transactions));
  const ready = selected.size > 0 && [...selected].every((index) => matches[index].status !== "INCOMPLETE" && (matches[index].status !== "CONFLICT" || (matches[index].existingId && replacements.has(index))));
  return <div className="inbox-workspace">
    <section className="editor-panel inbox-upload"><header className="section-heading"><span className="preview-eyebrow">TRANSACTION INBOX</span><h2>把成交记录放进来</h2><p>截图、文字与扫描 PDF 在本机识别。候选和文字来源保存到私人收件箱；原文件只在这次浏览器会话中预览。</p></header>
      <form onSubmit={upload}><label className="screenshot-drop"><strong>选择截图或结单 PDF</strong><small>图片最大 8 MB · PDF 最大 12 MB / 30 页</small><input type="file" name="document" accept="image/jpeg,image/png,image/webp,application/pdf" required disabled={busy} /></label><button type="submit" className="primary-button" disabled={busy}>{busy ? `处理文件 ${Math.round(progress*100)}%` : "识别并保存候选"}</button></form>
      {message ? <p role="status" className="inbox-message">{message}</p> : null}
    </section>
    {documents.length ? <div className="inbox-layout"><aside className="inbox-files" aria-label="已保存的文件">{documents.map((item) => <button type="button" key={item.id} aria-pressed={active === item.id} onClick={() => { if (dirty && !confirmUi("请先保存核对进度，或确认放弃未保存修改。")) return; setPreview(null); open(item); }}><strong>{item.filename}</strong><small>{item.createdAt.slice(0,10)} · {item.status === "DRAFT" ? "待确认" : item.status === "APPLIED" ? "已入账" : "已撤销"}</small></button>)}</aside>
      {doc ? <section className="inbox-review"><header className="section-heading"><h2>{doc.filename}</h2><p>{doc.status === "DRAFT" ? "成交截图缺少费用时先记 0，待月结单核对。结单差异逐笔确认后替换原记录；未知交收日期不猜填。" : doc.status === "APPLIED" ? "这份文件已入账，原交易备份已保留。" : "这次入账已撤销。"}</p></header>
        {preview ? <a className="secondary-button" href={preview} target="_blank" rel="noreferrer">打开本次原文件预览</a> : null}
        <details className="document-evidence"><summary>查看提取原文</summary><pre data-no-translate>{doc.rawText}</pre></details>
        {trades.map((trade,index) => {
          const match = matches[index]; const old = data.transactions.find((item) => item.id === match.existingId);
          const editable = doc.status === "DRAFT"; const priced = ["BUY","SELL","SUBSCRIPTION","REDEMPTION"].includes(trade.type);
          const num = (field: "quantity" | "unitPrice" | "fee" | "tax" | "fxToBase" | "totalAmount",label: string) => <label className="field"><span>{label}</span><input type="number" min="0" step="any" inputMode="decimal" value={trade[field] ?? ""} disabled={!editable || busy} onChange={(event) => change(index,{ [field]: event.target.value === "" ? null : Number(event.target.value) })} /></label>;
          return <article className={`inbox-candidate status-${match.status.toLowerCase()}`} key={index}>
            <header><label><input type="checkbox" checked={selected.has(index)} disabled={!editable || busy || match.status === "EXISTS"} onChange={() => toggle(index)} /><strong>{data.assets.find((asset) => asset.id === trade.assetId)?.symbol ?? "待匹配标的"}</strong></label><span className="status-pill">{inboxStatuses[match.status]}</span></header>
            {match.differences.length ? <p>{match.differences.join(" · ")}</p> : null}
            {old ? <div className="inbox-existing"><span>账本现有</span><strong>{old.quantity} × {old.unitPrice ?? "—"} {old.currency}</strong><small>费用 {old.fee} · 税 {old.tax} · 交收 {old.settlementDate ?? "未确认"}</small></div> : null}
            <div className="inbox-fields"><label className="field"><span>交易类型</span><select value={trade.type} disabled={!editable || busy} onChange={(event) => change(index,{ type: event.target.value as InboxTrade["type"] })}>{[["BUY","买入"],["SELL","卖出"],["SUBSCRIPTION","申购"],["REDEMPTION","赎回"],["DIVIDEND","股息"]].map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="field"><span>账户</span><select value={trade.accountId} disabled={!editable || busy} onChange={(event) => change(index,{accountId:event.target.value})}><option value="">请选择</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label className="field"><span>标的</span><select value={trade.assetId ?? ""} disabled={!editable || busy} onChange={(event) => { const asset = data.assets.find((asset) => asset.id === event.target.value); change(index,{assetId:event.target.value,currency:asset?.currency ?? trade.currency,fxToBase:asset?.currency === "USD" ? 1 : null}); }}><option value="">请选择</option>{data.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol}</option>)}</select></label>
              <label className="field"><span>成交日期</span><input type="date" value={trade.tradedAt} disabled={!editable || busy} onChange={(event) => change(index,{tradedAt:event.target.value})} /></label>
              <label className="field"><span>交收日期（可空）</span><input type="date" value={trade.settlementDate ?? ""} disabled={!editable || busy} onChange={(event) => change(index,{settlementDate:event.target.value || null})} /></label>
              {priced ? <>{num("quantity","数量")}{num("unitPrice",`成交价 · ${trade.currency}`)}</> : num("totalAmount",`税前股息金额 · ${trade.currency}`)}
              {num("fee","手续费")}{num("tax","税费")}<label className="field"><span>费用核对</span><select value={trade.feeStatus ?? "CONFIRMED"} disabled={!editable || busy} onChange={(event) => change(index,{feeStatus:event.target.value as FeeStatus})}>{Object.entries(feeStatusLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>{trade.currency !== "USD" ? num("fxToBase","交易日 1 单位币种兑 USD") : null}
            </div>
            {match.status === "CONFLICT" && match.existingId && editable ? <label className="inbox-replace"><input type="checkbox" checked={replacements.has(index)} onChange={() => setReplacements((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} />已核对原文，用这些数字替换上方交易</label> : null}
            <details className="document-evidence"><summary>此笔来源 · {trade.reference || "截图文字"}</summary><pre data-no-translate>{trade.evidence}</pre></details>
          </article>;
        })}
        {doc.status === "DRAFT" ? <div className="inbox-confirm"><button className="secondary-button" type="button" onClick={saveDraft} disabled={busy}>保存核对进度</button><p>确认成交日期、数量和价格。暂记费用不是最终结单数字；已核对的费用不会被截图中的暂记 0 覆盖。</p>{matches.length>0&&matches.every(match=>match.status==="EXISTS")?<button type="button" className="primary-button" disabled={busy} onClick={()=>void apply(trades.map((_,index)=>index))}>全部已存在，完成核对</button>:<button type="button" className="primary-button" disabled={!ready || busy} onClick={()=>void apply()}>{busy ? "保存中" : `确认处理 ${selected.size} 笔`}</button>}</div> : doc.status === "APPLIED" ? <button type="button" className="secondary-button" disabled={busy} onClick={undo}>撤销这次入账</button> : null}
      </section> : <p className="inline-empty">选择一份文件开始核对。</p>}
    </div> : null}
  </div>;
}
