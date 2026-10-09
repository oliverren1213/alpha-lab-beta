import assert from "node:assert/strict";
import test,{after} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {createServer} from "vite";

const sqlite=new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys=ON");
for(const name of ["0000_freezing_night_thrasher.sql","0001_sloppy_luminals.sql"]) sqlite.exec(await readFile(new URL(`../drizzle/${name}`,import.meta.url),"utf8"));
let beforeBatch=null;
const adapter={prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};},async batch(items){if(beforeBatch){const change=beforeBatch;beforeBatch=null;change();}sqlite.exec("BEGIN");try{const results=[];for(const item of items)results.push(await item.run());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error;}}};
globalThis.__betaTestEnv={DB:adapter};
const vite=await createServer({configFile:false,appType:"custom",logLevel:"silent",server:{middlewareMode:true},plugins:[{name:"beta-workers",resolveId(id){if(id==="cloudflare:workers")return "\0beta-workers";},load(id){if(id==="\0beta-workers")return "export const env=globalThis.__betaTestEnv";}}]});
after(async()=>{await vite.close();sqlite.close();delete globalThis.__betaTestEnv;});
const {ensureGuestDemoData,loadLabData,insertTransaction,resetGuestDemoData}=await vite.ssrLoadModule("/lib/database.ts");
const {saveInboxDocument,readInbox,applyInbox,undoInbox}=await vite.ssrLoadModule("/lib/inbox-store.ts");
const {calculatePortfolio}=await vite.ssrLoadModule("/lib/portfolio.ts");
const {periodInsights}=await vite.ssrLoadModule("/lib/insights.ts");
const a="guest_fixture-a",b="guest_fixture-b";
await ensureGuestDemoData(a);await ensureGuestDemoData(b);
const initial=await loadLabData(a);
const day=initial.prices.map(p=>p.priceDate).sort().at(-1);
const trade={accountId:initial.accounts[0].id,assetId:"asset-demo-nvda",type:"BUY",tradedAt:day,settlementDate:null,quantity:1,unitPrice:180,currency:"USD",fee:0,tax:0,feeStatus:"PROVISIONAL",fxToBase:1,totalAmount:null,reference:"fixture-new-trade",source:"Synthetic test",evidence:"Synthetic test"};
const select=(value=trade,replace=false)=>[{index:0,trade:value,replace}];
const document=async(value=trade)=>saveInboxDocument(a,{filename:"fixture.pdf",rawText:"Synthetic test",trades:[value]});

test("demo history and attribution use persisted simulation marks and update after ledger edits",async()=>{
  assert.equal(initial.demoMode,true);
  assert.equal(initial.reviews.length,2);
  assert.ok(initial.history.length>=81);
  assert.ok(initial.history.every(point=>point.portfolio!==null));
  const report=periodInsights(initial,day,day);
  assert.ok(Number.isFinite(report.pnl));
  const previous=initial.history.at(-1).portfolio;
  const doc=await document();await applyInbox(a,doc.id,select());
  const next=await loadLabData(a);
  assert.equal(next.history.at(-1).portfolio-previous,181);
  assert.equal(next.transactions.length,initial.transactions.length+1);
  assert.equal(next.transactions.find(tx=>tx.note?.includes("fixture-new-trade")).isDemo,true);
  assert.equal((await loadLabData(b)).transactions.length,initial.transactions.length);
  await undoInbox(a,doc.id);
  assert.equal((await loadLabData(a)).history.at(-1).portfolio,previous);
});

test("inbox save, apply, repeat and undo are isolated by visitor and atomic on concurrent writes",async()=>{
  const doc=await document();
  assert.equal((await readInbox(b)).length,0);
  await assert.rejects(applyInbox(b,doc.id,select()),/找不到/);
  await assert.rejects(undoInbox(b,doc.id),/不存在/);
  const bCount=(await loadLabData(b)).transactions.length;
  await assert.rejects(applyInbox(a,doc.id,select({...trade,accountId:(await loadLabData(b)).accounts[0].id})),/账户/);
  assert.equal((await loadLabData(a)).transactions.length,initial.transactions.length);
  await applyInbox(a,doc.id,select());
  assert.equal((await applyInbox(a,doc.id,select())).alreadyApplied,true);
  assert.equal((await loadLabData(a)).transactions.length,initial.transactions.length+1);
  await undoInbox(a,doc.id);
  assert.equal((await loadLabData(b)).transactions.length,bCount);
  const stale=await document();
  beforeBatch=()=>sqlite.prepare("UPDATE transactions SET note='Concurrent edit' WHERE id=?").run(initial.transactions[0].id);
  await assert.rejects(applyInbox(a,stale.id,select()),/本次未写入/);
  assert.equal((await loadLabData(a)).transactions.length,initial.transactions.length);
  assert.equal((await readInbox(a)).find(d=>d.id===stale.id).status,"DRAFT");
});

test("statement fee corrections replace one record and undo restores it without changing another visitor",async()=>{
  const doc=await document();await applyInbox(a,doc.id,select());
  const corrected={...trade,fee:2,tax:.5,feeStatus:"STATEMENT"};
  const statement=await document(corrected);await applyInbox(a,statement.id,select(corrected,true));
  const next=await loadLabData(a),saved=next.transactions.find(tx=>tx.note?.includes("fixture-new-trade"));
  assert.equal(next.transactions.length,initial.transactions.length+1);
  assert.equal(saved.fee,2);assert.equal(saved.tax,.5);assert.match(saved.note,/STATEMENT/);
  assert.equal(calculatePortfolio({...next,costMethod:"WEIGHTED_AVERAGE"}).positions.find(p=>p.symbol==="NVDA").quantity,101);
  await undoInbox(a,statement.id);
  assert.equal((await loadLabData(a)).transactions.find(tx=>tx.id===saved.id).fee,0);
  await undoInbox(a,doc.id);
});

test("notes, reviews and reset remain owner scoped and reset rebuilds the same demo",async()=>{
  const now=new Date().toISOString();
  for(const owner of [a,b])sqlite.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)").run(`weekly-note:${owner}:2026-10-05`,owner,now);
  assert.deepEqual((await loadLabData(a)).weeklyNotes.map(n=>n.text),[a]);
  assert.deepEqual((await loadLabData(b)).weeklyNotes.map(n=>n.text),[b]);
  const reviewsB=(await loadLabData(b)).reviews.map(r=>r.id);
  await assert.rejects(insertTransaction(a,{...trade,accountId:(await loadLabData(b)).accounts[0].id}),/Account/);
  await resetGuestDemoData(a);
  const reset=await loadLabData(a);
  assert.equal(reset.transactions.length,initial.transactions.length);
  assert.equal((await readInbox(a)).length,0);
  assert.equal(reset.weeklyNotes.length,0);
  assert.ok(reset.history.every(p=>p.portfolio!==null));
  assert.deepEqual((await loadLabData(b)).reviews.map(r=>r.id),reviewsB);
  assert.equal((await loadLabData(b)).weeklyNotes[0].text,b);
});
