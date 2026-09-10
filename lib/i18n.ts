export type Language = "en" | "zh";

const englishByChinese: Record<string, string> = {
  "组合总览": "Portfolio overview", "组合": "Portfolio", "交易账本": "Transaction ledger", "账本": "Ledger",
  "投资逻辑": "Investment theses", "逻辑": "Theses", "情景实验室": "Scenario lab", "情景": "Scenarios",
  "每周备忘": "Weekly memo", "备忘": "Memo", "数据与更新": "Data & updates", "数据": "Data",
  "投资组合": "Portfolio", "真实交易账本": "Transaction ledger", "情景压力测试": "Scenario stress test",
  "每周投资备忘": "Weekly investment memo", "数据状态": "Data status", "主要导航": "Primary navigation",
  "买入": "Buy", "卖出": "Sell", "股息": "Dividend", "股息税": "Dividend tax", "费用": "Fee",
  "申购": "Subscribe", "赎回": "Redeem", "拆股": "Stock split", "资金转入": "Cash in", "资金转出": "Cash out",
  "税前股息金额": "Gross dividend", "股息税金额": "Dividend tax", "费用金额": "Fee amount",
  "转入金额": "Cash-in amount", "转出金额": "Cash-out amount", "确认买入": "Confirm buy",
  "确认卖出": "Confirm sell", "记录股息": "Record dividend", "记录股息税": "Record dividend tax",
  "记录费用": "Record fee", "确认申购": "Confirm subscription", "确认赎回": "Confirm redemption",
  "记录拆股": "Record split", "记录转入": "Record cash in", "记录转出": "Record cash out",
  "正式收盘": "Official close", "免费实时行情": "Free real-time quote", "延迟行情": "Delayed quote",
  "基金净值": "Fund NAV", "演示数据": "Demo data", "访客演示空间": "Guest demo workspace",
  "退出": "Sign out", "显示货币": "Display currency", "主题": "Theme", "跟随系统": "System",
  "浅色": "Light", "深色": "Dark", "更新中": "Refreshing", "刷新数据": "Refresh data",
  "关闭提示": "Dismiss notice", "关闭": "Dismiss", "持仓市值": "Market value", "净投入": "Net contributions",
  "账本持仓成本": "Book cost", "账本现金": "Book cash", "已实现收益": "Realized P&L",
  "未实现收益": "Unrealized P&L", "股息收入": "Dividend income", "手续费和税费": "Fees & taxes",
  "汇率损益": "FX impact", "缺少数据": "Missing data", "缺少": "Missing", "缺少价格": "Price missing",
  "缺少估值日期": "Valuation date missing", "估值不完整": "Incomplete valuation", "账本有待核对项": "Ledger needs review",
  "账本现金为负": "Negative book cash", "账户净值": "Portfolio value", "今日价格影响（估算）": "Today's price impact (est.)",
  "累计损益": "Cumulative P&L", "净投入回报（非年化）": "Return on net contributions (not annualized)",
  "组合关键指标": "Key portfolio metrics", "持仓": "Holdings", "成本口径": "Cost method",
  "加权平均": "Weighted average", "标的": "Asset", "数量": "Quantity", "当前价格": "Current price",
  "持仓成本": "Holding cost", "市值": "Market value", "今日价格影响": "Today's price impact",
  "持有损益": "Holding P&L", "杠杆 ETF": "Leveraged ETF", "无日期": "No date", "价格来源": "Price source",
  "未记录数据源": "Source not recorded", "无获取时间": "No fetch time", "数据源标记为延迟": "Source marked delayed",
  "数据源未标记延迟": "Source not marked delayed", "份": "units", "股": "shares", "含待核对交易": "Includes unverified trades",
  "收益拆解": "Return breakdown", "已实现、未实现、股息、费用与汇率影响": "Realized, unrealized, dividends, fees and FX impact",
  "集中度": "Concentration", "按标的": "By asset", "更多组合分析": "More portfolio analytics",
  "账户、资产类型与历史快照": "Accounts, asset types and history", "按账户": "By account",
  "按资产类型": "By asset type", "按行业": "By sector", "最近快照": "Recent snapshots", "日期": "Date",
  "本金": "Contributions", "状态": "Status", "缺少汇率": "FX rate missing", "尚无每日组合快照。": "No daily portfolio snapshots yet.",
  "记录一笔交易": "Record a transaction", "修改交易": "Edit transaction", "交易类型": "Transaction type",
  "账户": "Account", "请先导入资产": "Import an asset first", "成交日期（以券商为准）": "Trade date (per broker record)",
  "份额": "Units", "例如 1": "e.g. 1", "成交净值": "Execution NAV", "成交价": "Execution price",
  "以结单为准": "Use the broker statement", "金额": "Amount", "请输入实际金额": "Enter the actual amount",
  "拆股倍数": "Split ratio", "例如 3 表示 1 拆 3": "e.g. 3 means a 3-for-1 split", "交易币种": "Trade currency",
  "不要用今天汇率代替": "Do not substitute today's FX rate", "只填结单所用或可核实的成交日汇率": "Use the statement FX rate or a verifiable trade-date rate",
  "发现重复": "Duplicate found", "将记录": "To be recorded", "待选择日期": "Select a date", "待选择账户": "Select an account",
  "费用与更多信息": "Fees & details", "手续费、税费、结算与备注": "Fees, taxes, settlement and notes",
  "手续费": "Fee", "税费": "Tax", "结算日期": "Settlement date", "来源": "Source", "备注": "Notes",
  "选填：订单号、费用说明或其他核对线索": "Optional: order ID, fee details or reconciliation notes",
  "已核对原始成交记录": "Verified against the original trade record",
  "数量、成交价和费用都与券商或基金平台记录一致时再勾选": "Check only after quantity, price and fees match the broker or fund record",
  "取消编辑": "Cancel edit", "保存中": "Saving", "保存修改": "Save changes", "正式账本": "Official ledger",
  "搜索账本": "Search ledger", "搜索标的、来源或备注": "Search asset, source or notes", "筛选交易类型": "Filter transaction type",
  "全部类型": "All types", "成交日期": "Trade date", "类型": "Type", "单价": "Unit price", "费用和税": "Fees & taxes",
  "核对": "Verification", "操作": "Actions", "现金": "Cash", "未知账户": "Unknown account", "已核对": "Verified",
  "待核对": "Needs review", "编辑": "Edit", "删除": "Delete", "没有符合当前筛选的交易。": "No transactions match the current filters.",
  "导入批次": "Import batches", "删除批次": "Delete batch", "导入、导出与备份": "Import, export & backup",
  "从 CSV 建立第一份账本": "Create your first ledger from CSV", "选择 CSV": "Choose CSV", "导入中": "Importing",
  "导入账本": "Import ledger", "下载模板": "Download template", "导出 CSV": "Export CSV", "完整 JSON 备份": "Full JSON backup",
  "选择备份": "Choose backup", "恢复": "Restore", "记录原始判断": "Record the original thesis", "决策类型": "Decision type",
  "投资": "Investment", "交易": "Trade", "任务性交易": "Tactical trade", "观察": "Watch", "建立日期": "Start date",
  "预期持有期限": "Expected holding period", "例如 3 到 5 年": "e.g. 3 to 5 years", "最大可接受亏损": "Maximum acceptable loss",
  "以小数或金额记录": "Enter a percentage or amount", "计划仓位": "Target weight", "例如 0.08": "e.g. 0.08",
  "信心等级": "Confidence", "当前状态": "Current status", "买入或观察理由": "Buy / watch rationale",
  "市场可能低估的因素": "What the market may be underpricing", "关键催化剂": "Key catalysts", "主要风险": "Key risks",
  "Thesis 失效条件": "Thesis invalidation conditions", "信息来源": "Sources", "保存原始判断": "Save original thesis",
  "Thesis 档案": "Thesis archive", "原始理由": "Original rationale", "失效条件": "Invalidation conditions",
  "追加 revision": "Add revision", "当前判断": "Current view", "追加，不覆盖": "Append without overwriting",
  "调整冲击假设": "Set shock assumptions", "QQQ 变化": "QQQ change", "半导体板块": "Semiconductors",
  "USD/CNY 变化": "USD/CNY change", "USD/HKD 变化": "USD/HKD change", "EUR/USD 变化": "EUR/USD change",
  "追加资金，USD": "Additional cash, USD", "清空假设": "Reset assumptions", "组合影响": "Portfolio impact",
  "情景后组合价值": "Post-scenario portfolio value", "情景前": "Before scenario", "恢复所需上涨": "Recovery required",
  "打印或保存 PDF": "Print or save PDF", "当前组合": "Current portfolio", "本周组合变化": "Portfolio change this week",
  "收益来源": "Sources of return", "主要持仓": "Largest holding", "Thesis 状态": "Thesis status", "最大风险": "Largest risk",
  "数据与账目": "Data & ledger", "最近成功更新": "Last successful update", "尚未成功执行": "No successful run yet",
  "暂无更新记录": "No update history", "立即刷新": "Refresh now", "数据来源": "Data sources", "启用": "Enabled", "停用": "Disabled",
  "最近成功": "Last success", "尚无": "None yet", "最近错误": "Last error", "无": "None", "确认基金 NAV": "Confirm fund NAV",
  "基金": "Fund", "净值日期": "NAV date", "确认并写入": "Confirm and save", "价格审计": "Price audit",
  "价格日期": "Price date", "报价时间": "Quote time", "数据属性": "Data quality", "延迟": "Delayed", "是": "Yes",
  "否或未标记": "No / not flagged", "基准收盘": "Benchmark closes", "汇率记录": "FX records", "免费调度方案": "Free scheduling",
  "未更新": "Not updated", "部分更新": "Partially updated", "数据过期": "Data stale", "数据已更新": "Data current",
  "等待首次真实写入": "Waiting for first real write", "无数据": "No data", "手工录入": "Manual entry",
  "NVDA 财报不及预期": "NVDA earnings miss", "AI 与半导体回调": "AI & semiconductor pullback",
  "Nasdaq 熊市": "Nasdaq bear market", "软着陆与降息": "Soft landing & rate cuts", "美元走弱": "Weaker US dollar",
  "全球股票组合（演示）": "Global equity portfolio (demo)", "科技成长组合（演示）": "Technology growth portfolio (demo)",
  "访客演示账户": "Guest demo account", "明确标注的访客演示数据": "Clearly labeled guest demo data",
  "这是独立的访客演示空间；预置内容均为明确标注的示例数据，不是任何人的真实持仓。": "This is an isolated guest workspace. All preloaded records are clearly labeled examples—not anyone's real holdings.",
  "先建立真实账本": "Build your ledger first", "导入结单 CSV 或录入第一笔交易后，这里才会计算持仓、成本和收益。系统不会放入演示持仓。": "Import a broker CSV or record your first trade to calculate holdings, cost and returns. The system never presents demo holdings as real data.",
  "打开交易账本": "Open transaction ledger", "成本包含已计入账本的手续费和税费；待核对成交会明确标记。": "Cost includes fees and taxes recorded in the ledger. Unverified trades are clearly flagged.",
  "按账户净值计算；负现金可能使持仓权重合计超过 100%。": "Calculated against account value; negative cash can make holding weights exceed 100% in total.",
  "只记录已成交；未成交和已撤销订单不用录。系统会自动检查重复。": "Record executed trades only. Open and cancelled orders stay out; duplicates are detected automatically.",
  "尚无账户。先用 CSV 模板导入第一批真实记录，账户与资产会一并建立。": "No account yet. Import the CSV template to create the first account and assets.",
  "这笔成交已在账本中，不会重复写入。": "This trade already exists and will not be recorded twice.",
  "先写下当时真正相信的理由。系统保存 revision，不会用后见之明覆盖旧版本。": "Capture what you genuinely believed at the time. Revisions are appended, never rewritten with hindsight.",
  "先导入至少一个真实资产，才能建立投资逻辑。": "Import at least one asset before recording an investment thesis.",
  "还没有 thesis。记录第一条时，系统会同时安排复盘日期。": "No thesis yet. Recording one also creates review dates.",
  "所有数字都是用户设定的情景，不是预测，也不会写回正式账本。": "Every input is a user-defined scenario—not a forecast—and never alters the official ledger.",
  "杠杆 ETF 只使用清楚标注的单日近似，不制造长期路径精度。": "Leveraged ETFs use a clearly labeled one-day approximation; the tool does not invent long-term path precision.",
  "需要完整持仓、价格和汇率后才能运行情景。": "Complete holdings, prices and FX rates are required to run a scenario.",
  "可从历史快照核对组合与本金变化。": "Portfolio value and contributions can be reconciled from historical snapshots.",
  "暂无足够的周初和周末快照，不能虚构周度变动。": "There are not enough opening and closing snapshots to calculate a weekly change reliably.",
  "缺少可计算数据。": "Insufficient data to calculate.", "尚无持仓。": "No holdings yet.",
  "最近七天没有已记录的 thesis 变化。": "No thesis changes were recorded in the last seven days.",
  "当前数据未触发单一持仓超过 25% 的提示。": "No single holding currently exceeds the 25% concentration threshold.",
  "这是个人记录与分析，不构成投资建议，也不会鼓励为了互动而交易。": "This is a record-keeping and analysis tool, not investment advice or an engagement-driven trading prompt.",
  "行情、基金净值和汇率分开记录。没有新数据时保留最近有效值，并显示原始日期。": "Market prices, fund NAVs and FX rates are tracked separately. When no new value exists, the latest valid value and its original date remain visible.",
  "只有人工确认的净值会进入正式数据库。请同时保留基金公布的原始净值日期。": "Only user-confirmed NAVs enter the official database. Always preserve the fund's original NAV date.",
  "账本中还没有基金资产。导入基金申购记录后可在此维护 NAV。": "No fund asset exists in the ledger. Import a subscription record to maintain its NAV here.",
  "页面展示的是每项当前持仓实际采用的价格，而不是请求时间伪装出的今日价格。": "The audit shows the price actually used for each holding—not a request timestamp disguised as today's price.",
  "尚无可审计的持仓价格。": "No holding prices are available for audit.",
  "QQQ 与 SPY 只保存最近正式收盘，不把下午盘中报价伪装成收盘数据。": "QQQ and SPY retain official closes only; intraday quotes are never presented as closing data.",
  "尚无基准记录。上午更新成功后会写入 QQQ 与 SPY。": "No benchmark records yet. A successful morning update will add QQQ and SPY.",
  "Frankfurter 使用 ECB 最近公布的工作日参考汇率，不伪装成盘中外汇报价。": "Frankfurter uses the ECB's latest published working-day reference rates, not intraday FX quotes.",
  "尚无汇率。点击刷新后会先尝试无需 key 的 ECB 数据源。": "No FX rates yet. Refresh first tries the key-free ECB source.",
  "Cloudflare Cron 已配置 Rome 09:15 与 18:15 的冬夏令时候选时间，Worker 只在对应 Rome 时间窗口执行。页面出现真实 CRON 运行记录后，可确认远程自动更新已实际运行。": "Cloudflare Cron covers Rome 09:15 and 18:15 across daylight-saving changes. The Worker runs only in the matching Rome-time window; a real CRON run in the log confirms remote automation.",
  "关于项目": "About the project", "关于": "About", "关于 Alpha Lab": "About Alpha Lab",
  "独立演示空间": "Isolated demo workspace", "示例数据与你的操作只存在于当前访客空间，不是任何人的真实持仓。": "Example data and your changes stay inside this guest workspace. Nothing shown is anyone's real portfolio.",
  "使用指南": "Guide", "重置演示": "Reset demo", "重置中": "Resetting",
  "从一笔交易，到一套可核对的投资决策。": "From one trade to an investment process you can audit.",
  "体验真实成本、收益归因、价格审计与投资逻辑。所有预置记录都明确标注为演示数据。": "Explore true cost basis, return attribution, price provenance and investment theses. Every preloaded record is explicitly labeled as demo data.",
  "查看组合": "Review the portfolio", "先看成本、收益和价格时间。": "Start with cost, returns and price timestamps.",
  "试录交易": "Try recording a trade", "重复成交会自动拦截。": "Duplicate trades are blocked automatically.",
  "运行情景": "Run a scenario", "改变假设，不改正式账本。": "Change assumptions without changing the ledger.",
  "开始体验": "Explore the demo", "直接试录交易": "Record a trade",
  "组合轨迹": "Portfolio trajectory", "每日快照写入后，这里会形成可核对的历史曲线。": "A traceable history appears here after daily snapshots are saved.",
  "组合历史价值曲线": "Historical portfolio value chart", "数据健康概览": "Data health overview",
  "快速录入": "Quick entry", "你做了什么交易？": "What did you trade?", "选择动作后，只需完成三步。高级字段默认收起。": "Choose an action, then complete three focused steps. Advanced fields stay out of the way.",
  "其他交易": "Other transaction", "交易录入步骤": "Transaction entry steps", "选择交易": "Choose transaction",
  "填写成交": "Enter execution", "核对保存": "Review & save", "先确认方向、账户与标的。": "Confirm the direction, account and asset.",
  "下一步：填写成交": "Next: execution details", "使用券商或基金平台上的实际数字。": "Use the actual figures from your broker or fund platform.",
  "下一步：核对": "Next: review", "核对并保存": "Review and save", "保存前再看一眼关键信息。": "Check the key details once more before saving.",
  "返回": "Back", "返回修改": "Back to edit", "取消": "Cancel",
  "持仓定价": "Holdings priced", "有可审计价格的当前持仓": "Current holdings with an auditable price", "待处理问题": "Issues to review",
  "数据源最近错误": "Recent data-source errors", "当前可用货币对": "Currently available currency pairs",
  "查看数据来源": "View data sources", "行情、基金净值与汇率的完整状态": "Full status for prices, fund NAVs and FX rates",
  "演示空间已恢复，可以重新体验所有功能": "The demo workspace has been restored.",
  "无法重置演示空间": "Unable to reset the demo workspace",
  "重置会清除你在当前访客空间的修改，并恢复演示数据。继续？": "Resetting removes your changes in this guest workspace and restores the demo data. Continue?",
  "确认删除这笔交易？此操作会改变成本和收益计算。": "Delete this transaction? Cost basis and return calculations will change.",
  "导入 CSV 会替换当前演示数据，并建立你的独立账本。继续？": "Importing this CSV replaces the demo data and creates your isolated ledger. Continue?",
  "恢复会替换当前 Alpha Lab 数据。确认继续？": "Restoring replaces the current Alpha Lab data. Continue?",
  "确认删除整个导入批次？": "Delete this entire import batch?",
  "一个为证据而生，而不是为情绪而生的投资工作台。": "An investment workspace built for evidence, not excitement.",
  "Alpha Lab 把交易账本、组合计算、价格来源和原始投资逻辑连接起来，让每个数字可追溯、每个决策可复盘。": "Alpha Lab connects the transaction ledger, portfolio math, price provenance and the original investment thesis—so every number can be traced and every decision can be reviewed.",
  "从设计开始即可核对": "Auditable by design", "账户级数据隔离": "Private by account", "不做 AI 荐股": "No AI stock picks",
  "账本优先的核算": "Ledger-first accounting", "加权平均与 FIFO 成本、费用、税费、现金流、基金、拆股和重复交易保护，全部以原始交易记录为起点。": "Weighted-average and FIFO cost basis, fees, taxes, cash flows, funds, splits and duplicate-trade protection all begin with the underlying transaction record.",
  "诚实的行情数据": "Honest market data", "价格日期、报价时间、来源和延迟状态始终可见。缺失数据保持缺失，请求时间不会伪装成今日价格。": "Price date, quote time, provider and delay status remain visible. Missing data stays missing; a request timestamp never masquerades as today’s price.",
  "决策质量": "Decision quality", "版本化投资逻辑和情景测试把原始判断与后见之明分开，也不会把预测写进正式账本。": "Versioned investment theses and scenario tests separate the original reasoning from hindsight and keep forecasts out of the official ledger.",
  "生产级架构": "Production architecture", "React 与 Vinext 运行于 Cloudflare Worker，并采用账户隔离的 D1 持久化、签名访客会话和确定性的金融计算测试。": "React and Vinext run on a Cloudflare Worker with owner-scoped D1 persistence, signed guest sessions and deterministic financial-calculation tests.",
  "Public Beta 边界": "Public Beta boundary", "此演示不会执行交易，也不提供个性化投资建议。匿名访客获得隔离的示例数据，并可随时重置空间。": "This demo does not execute trades or provide personalized investment advice. Anonymous visitors receive isolated example data and may reset the workspace at any time.",
};

const chineseByEnglish = Object.fromEntries(Object.entries(englishByChinese).map(([zh, en]) => [en, zh]));
const attributes = ["aria-label", "title", "placeholder", "data-label"];

export function installTranslations(language: Language) {
  const translate = (value: string) => translateText(value, language);
  const apply = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) {
      const value = root.nodeValue ?? "";
      const next = translate(value);
      if (next !== value) root.nodeValue = next;
      return;
    }
    if (!(root instanceof Element)) return;
    for (const attribute of attributes) {
      const value = root.getAttribute(attribute);
      if (value) root.setAttribute(attribute, translate(value));
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.nodeValue ?? "";
        const next = translate(value);
        if (next !== value) node.nodeValue = next;
      } else if (node instanceof Element) {
        for (const attribute of attributes) {
          const value = node.getAttribute(attribute);
          if (value) node.setAttribute(attribute, translate(value));
        }
      }
    }
  };
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  apply(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") apply(mutation.target);
      for (const node of mutation.addedNodes) apply(node);
    }
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  return () => observer.disconnect();
}

export function translateText(value: string, language: Language) {
  return language === "en" ? toEnglish(value) : toChinese(value);
}

function toEnglish(value: string) {
  return translateExact(value, englishByChinese)
    .replace(/(\d+) 项持仓缺少价格或汇率/g, "$1 holdings are missing a price or FX rate")
    .replace(/(\d+) 笔交易待核对/g, "$1 transactions need review")
    .replace(/(\d+) 笔记录，按成交日期倒序。资金转入不会被计入投资收益。/g, "$1 records, newest first. Cash deposits are excluded from investment returns.")
    .replace(/(\d+) 条逻辑记录。短期涨跌不会自动决定 thesis 对错。/g, "$1 thesis records. Short-term price moves do not automatically validate a thesis.")
    .replace(/查看 (\d+) 个 revision/g, "View $1 revisions")
    .replace(/最近运行 ([A-Z]+)，(\d+) 成功，(\d+) 失败/g, "Latest run: $1 · $2 succeeded · $3 failed")
    .replace(/均价 ([^/]+) \/ 股/g, "Avg. $1 / share")
    .replace(/均价 ([^/]+) \/ 份/g, "Avg. $1 / unit")
    .replace(/报价 (.+)/g, "Quoted $1")
    .replace(/获取 (.+)/g, "Fetched $1")
    .replace(/比较基准 (.+)/g, "Reference $1");
}

function toChinese(value: string) {
  return translateExact(value, chineseByEnglish)
    .replace(/(\d+) holdings are missing a price or FX rate/g, "$1 项持仓缺少价格或汇率")
    .replace(/(\d+) transactions need review/g, "$1 笔交易待核对")
    .replace(/(\d+) records, newest first\. Cash deposits are excluded from investment returns\./g, "$1 笔记录，按成交日期倒序。资金转入不会被计入投资收益。")
    .replace(/(\d+) thesis records\. Short-term price moves do not automatically validate a thesis\./g, "$1 条逻辑记录。短期涨跌不会自动决定 thesis 对错。")
    .replace(/View (\d+) revisions/g, "查看 $1 个 revision")
    .replace(/Latest run: ([A-Z]+) · (\d+) succeeded · (\d+) failed/g, "最近运行 $1，$2 成功，$3 失败")
    .replace(/Avg\. ([^/]+) \/ share/g, "均价 $1 / 股")
    .replace(/Avg\. ([^/]+) \/ unit/g, "均价 $1 / 份")
    .replace(/Quoted (.+)/g, "报价 $1")
    .replace(/Fetched (.+)/g, "获取 $1")
    .replace(/Reference (.+)/g, "比较基准 $1");
}

function translateExact(value: string, dictionary: Record<string, string>) {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return value;
  return `${match[1]}${dictionary[match[2]] ?? match[2]}${match[3]}`;
}
