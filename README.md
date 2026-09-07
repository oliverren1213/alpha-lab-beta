# Alpha Lab Beta

Alpha Lab Beta 是一个公开可访问、数据按用户隔离的投资账本与决策复盘系统。每位用户通过 ChatGPT 登录，只能读取自己的交易、持仓、基金 NAV、快照与投资逻辑。它不会连接券商、自动交易或生成 AI 荐股。

## 当前状态

- 运行平台：Cloudflare Worker / Sites；本地开发使用同一套 Worker 兼容构建。
- 数据库：Cloudflare D1；本地开发使用项目目录内的持久化 D1 状态。
- 美股与 ETF：Finnhub 免费个人账户 API；上午写最近正式收盘，下午写带原始时间戳的最新免费报价。
- 汇率：Frankfurter，底层为 ECB 工作日参考汇率，无需 key。
- 基金：人工确认 NAV。每条记录保留原始 NAV 日期，没有新净值时继续使用最近有效值。
- 自动更新：生产 Worker 使用免费的 Cloudflare Cron；只有线上任务真实写入 D1 后才算实际运行。
- 演示数据：应用不会自动写入 DEMO 或随机行情。测试只使用固定 fixture，且不会进入 D1。

在真实 Finnhub 行情与 ECB 汇率成功写入生产 D1、页面重新加载仍能读取之前，不应把远程自动更新描述为已完成。

## 产品功能

- 组合总览：总资产、本金、持仓市值、今日收益、累计收益、已实现与未实现收益、股息、费用和税、汇率损益、总回报率。
- 多币种显示：USD、HKD、RMB/CNY、EUR。
- 持仓审计：价格日期、报价时间、获取时间、provider、是否延迟、今日收益比较基准。
- 交易账本：新增、编辑、删除、CSV 导入导出、JSON 完整备份恢复、导入批次删除。
- 成本方法：加权平均成本或 FIFO。同一份报告只使用一种方法。
- 基金 NAV：人工确认净值及真实净值日期，并在可计算时写入组合快照。
- Investment Thesis：保存原始判断、追加 revision、自动安排 7、30、90 天复盘日期。
- Scenario Lab：QQQ、半导体、汇率、追加资金及单一标的冲击。
- Weekly Memo：一页式可打印备忘录，不鼓励频繁交易。
- 账号登录：由 Sites 提供 Sign in with ChatGPT；所有写入都执行同源检查，并以平台用户 ID 隔离。

## 收益计算口径

默认报告使用加权平均成本，用户可以切换为 FIFO。

### 当前市值

```text
持仓市值 USD = 数量 × 最新有效价格或 NAV × 当前币种兑 USD 汇率
总资产 USD = 所有持仓市值 USD + 账面现金 USD
```

任何价格或汇率缺失时，系统返回“缺少数据”，不会静默使用 0。

### 本金与累计收益

```text
净投入本金 = 外部资金转入 - 外部资金转出
累计收益 = 当前总资产 - 净投入本金
总回报率 = 累计收益 ÷ 净投入本金
```

资金转入增加本金和现金，不被算成投资收益。

### 已实现与未实现收益

- 加权平均：卖出成本按卖出前的平均单位成本分配。
- FIFO：卖出先消耗最早买入批次。
- 买入手续费与税费进入成本基础。
- 卖出手续费与税费从卖出所得扣除。
- 未实现收益 = 当前持仓市值 - 剩余成本基础。
- 股息、预扣税和独立费用单独展示，不重复记入费用字段。

### 今日收益

- 下午报价：当前免费行情对比最近一次正式收盘价。
- 上午正式收盘：对比前一个不同价格日期的正式收盘价。
- 基金：最新有效 NAV 对比前一个不同 NAV 日期。
- 若缺少比较基准，今日收益显示为缺少数据，不制造 0 收益。

当前 V1 的今日收益主要反映持仓价格变化，不包含当日新增资金、当日交易时点效应或盘中汇率归因。精细日内归因属于后续版本。

### 汇率损益

交易保存交易日兑 USD 汇率；当前估值使用最近 ECB 参考汇率。V1 将当前价格按“当前汇率与收购期隐含汇率之差”估算汇率影响。这是可核对的近似，不是完整的时间加权归因。

## 数据源与限制

### Finnhub

- 用途：美国股票和 ETF。
- 上午：读取 previous close，并保存正式收盘口径。
- 下午：读取当前免费 quote，保存 provider quote timestamp。
- 许可：默认方案只面向密码保护的个人使用；不得转售或公开分发行情。
- 限制：需要免费个人 API key；真实延迟状态和时间戳必须在配置 key 后逐项验证。

申请地址：[Finnhub](https://finnhub.io/)。不要把 key 粘贴到聊天中，应只写入本地或托管平台的服务端环境变量。

### Frankfurter / ECB

- 用途：USD/HKD、USD/CNY、USD/EUR 及交叉换算。
- 无需 key。
- 数据是 ECB 最近发布的工作日参考汇率，不是实时外汇交易报价。

### 基金 NAV

- 默认不抓取基金网页。
- 只接受用户人工确认的 NAV 与 NAV 日期。
- 没有新 NAV 时继续使用最近有效记录，页面始终显示真实净值日期。

### Alpha Vantage

- 仅作为可选的股票基本面 provider。
- 免费额度有限，不承担下午行情。
- `ALPHA_VANTAGE_API_KEY` 留空不会影响账本、ECB 汇率或人工基金 NAV。

系统没有使用 Yahoo 或 Google Finance 页面抓取，也没有随机行情。

## 更新计划

更新模式以 `Europe/Rome` 为准：

- 09:15：最近正式收盘价、最新基金 NAV 和 ECB 汇率。
- 18:15：免费行情源能提供的最新报价、最新基金 NAV 和 ECB 汇率。
- 页面打开时：最近成功更新时间超过 90 分钟，客户端后台请求一次受保护的补刷新。

`.github/workflows/alpha-lab-daily.yml` 同时列出 Rome 冬令时与夏令时对应的 UTC 候选时间。服务端再次校验 Rome 时间窗口，错误时区候选会被跳过。更新接口要求 `Authorization: Bearer <CRON_SECRET>`。

Cloudflare Cron 可能发生平台级延迟，因此 09:15 和 18:15 是目标触发时间，不是秒级 SLA。每天两次不需要付费升级。

### 更新可靠性

- 同日、同标的、同 provider、同 session 由 D1 唯一约束防止重复价格。
- 同日、同基准货币、同 session 只有一份组合快照。
- 请求有 12 秒超时、最多三次重试与指数退避。
- 单一标的失败不会删除以前的有效价格。
- 每次运行记录状态、成功数、失败数和不含密钥的错误摘要。
- 运行中任务有 15 分钟互斥窗口；手工刷新有 5 分钟冷却；页面补刷新有 90 分钟冷却。

## 环境变量

从 `.dev.vars.example` 复制为 `.dev.vars`：

```text
ALPHA_PASSWORD_HASH=PBKDF2 hash
ALPHA_SESSION_SECRET=至少 32 个随机字符
CRON_SECRET=至少 32 个随机字符
COOKIE_SECURE=false
ALLOW_DEV_REFRESH=true
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
ALPHA_VANTAGE_THROTTLE_MS=13000
```

生产环境必须使用 `COOKIE_SECURE=true` 和 `ALLOW_DEV_REFRESH=false`。

生成密码 hash：

```bash
npm run auth:hash -- "your password"
```

生成随机 secret：

```bash
openssl rand -base64 36
```

## 本地运行

要求 Node.js 22.13 或更新版本。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，使用已经配置为 hash 的访问密码登录。

模拟受保护的上午或下午任务：

```bash
npm run refresh:local -- MORNING
npm run refresh:local -- AFTERNOON
```

该命令要求本地开发服务器已经启动，并且 `.dev.vars` 中设置了 `CRON_SECRET` 与 `ALLOW_DEV_REFRESH=true`。

## CSV 导入

模板位于 `public/alpha-lab-transactions-template.csv`，也可在交易账本页面下载。字段：

```text
account_name,institution,masked_account,symbol,asset_name,asset_type,
transaction_type,traded_at,settlement_date,quantity,unit_price,currency,
fee,tax,fx_to_usd,total_amount,source,note,reconciled
```

- `asset_type`：`STOCK`、`ETF`、`FUND`、`CASH`。
- `transaction_type`：`BUY`、`SELL`、`DIVIDEND`、`DIVIDEND_TAX`、`FEE`、`SUBSCRIPTION`、`REDEMPTION`、`SPLIT`、`CASH_IN`、`CASH_OUT`。
- 非 USD 行必须填写正数 `fx_to_usd`。
- 账户号码只保留末四位，导入器会再次掩码。
- PDF 或截图解析未进入 V1；任何未来解析结果必须先成为待确认草稿。

## 备份与恢复

- CSV 导出只包含交易账本。
- JSON 备份包含账户、资产、交易、价格、汇率、快照、thesis、复盘、导入批次和更新记录。
- 恢复前界面会要求明确确认，并替换当前 Alpha Lab 数据。
- V2 备份格式可以兼容恢复缺少 session 字段的 V1 备份。

## 数据库迁移

Drizzle schema 位于 `db/schema.ts`。当前初始化迁移：

```text
drizzle/0000_freezing_night_thrasher.sql
```

修改 schema 后运行：

```bash
npm run db:generate
```

## 免费调度

生产部署由 Worker 的 Cloudflare Cron 直接触发，无需额外 API key。`.github/workflows/alpha-lab-daily.yml` 保留为迁移到其他平台时的免费备用方案；使用该备用方案时需在 GitHub 仓库 Secrets 中设置：

- `ALPHA_LAB_URL`：部署地址，不包含密钥。
- `ALPHA_LAB_CRON_SECRET`：与服务端 `CRON_SECRET` 完全相同。

备用工作流不会部署网站，也不会购买服务。

## 检查命令

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

固定测试覆盖加权平均、FIFO、部分卖出、清仓回购、股息税、费用、拆股、基金申购赎回、多币种、资金转入、缺失价格、上午与下午 session、Rome 冬夏令时、90 分钟 stale、休市日、CSV 和 TQQQ 模型提示。

## 已知限制与 V2

- 真实美股报价仍需 Finnhub 免费 key 后做端到端写入与页面重载验证。
- QQQ/SPY 在上午任务中保存最近正式收盘，并在数据审计页展示。
- 股票基本面只有配置 Alpha Vantage key 后才更新。
- Decision Review 已有数据模型与复盘日期，完整评分编辑界面属于 V2。
- TQQQ 情景使用单日 3 倍近似；长期路径需要每日路径、波动率和再平衡模拟。
- 更精细的收益归因应增加时间加权回报、现金流时点与汇率交叉项。
- PDF/截图只应作为待确认导入草稿，不能直接写入正式账本。

所有计算仍应由用户用券商结单、基金公告和原始交易记录人工核对。
