# X 监测与回复系统 — 设计文档

**日期**：2026-04-28
**作者**：Ross Yu（FinTax）+ Claude
**状态**：设计稿（待 review）

---

## 1. 系统目标

一个跑在本地 Mac 上、24/7 运行的 X（Twitter）监测与回复系统。覆盖三个使用场景：

- **场景 1（文章匹配）**：扫到加密税务相关帖子 → 在 Dify 知识库中找到匹配文章 → 拆出片段写成评论草稿
- **场景 2（KB 综合讨论）**：扫到加密税务相关帖子但无单篇文章强匹配 → 基于 KB 多片段综合，与用户讨论方向后生成草稿
- **场景 3（潜客互动）**：来自外部潜客名单的账号发帖 → 相关则用 KB 写有价值评论；不相关但私人化则提醒用户考虑点赞；其他跳过

三个场景共用同一条流水线，只在「AI 处理层」分支。

## 2. 核心约束

| 约束 | 说明 |
|---|---|
| 单人使用，团队预留 | 暂不做权限/账号体系，但数据模型边界清晰 |
| **全部内容必须人工审核**后才能发送 | 没有任何全自动发送 |
| 多 X 账号 | FinTax_Official + 个人号 + 创始人号，独立节流与登录态 |
| **所有 AI 内容严格基于 Dify 知识库**（出处可追溯）| 不允许 LLM 凭训练数据自由发挥 |
| 本地 Mac 24/7 运行 | launchd + caffeinate 防休眠 |
| 无 Anthropic API key | AI 调用通过 Claude Code Max 订阅完成 |
| 5–15 分钟级 AI 处理延迟可接受 | 不追求秒级实时 |
| 翻墙网络专线 | 网络稳定性远高于消费级 VPN，但仍需保留容错 |
| 时间窗口分场景 | 场景 1：3–6 个月；场景 2：1 周；场景 3：2 天 |

## 3. 设计原则

### 3.1 第一原则：修补优先（Patch-Friendly Code）

系统跑起来后会持续暴露问题。每个发现的问题，用户都会通过对话告诉 Claude，Claude 修改代码完成调整。**架构必须让 Claude 修改时能快速定位、低风险变更**。

落地为 7 条具体准则：

1. **文件小而专注**：每个易变的逻辑（prompt、规则、关键词、调度算法等）独立文件，几百行而非几千行
2. **强类型契约**：模块间 TypeScript 接口定义清晰，编译器约束变更
3. **配置即代码**：prompts、rules、keywords 都是 TypeScript 文件，git 负责版本化，不在数据库里再造一套
4. **检视工具齐全**：CLI 工具支持 inspect/replay/dry-run 任何状态
5. **测试固定上下文**：每个核心模块有 fixture，改完跑一次能看到行为变化
6. **日志结构化、trace_id 全链路**：一条帖子从 scanner 到 poster 同一个 trace_id
7. **副作用可关、可重定向**：每个真实操作 X 的动作支持 dry-run 与 kill switch

### 3.2 第二原则：故障域隔离

系统按依赖资源分三层，每层独立失败：

- **采集 + 发送 + 回收**：纯网络/浏览器自动化，不依赖 AI；炸了不影响 AI 处理
- **AI 处理**：依赖 Claude Code 额度；额度用尽时只是慢，不影响其他层
- **存储 + 面板**：本地 SQLite + Redis；面板挂了不影响后台流水线

### 3.3 第三原则：人在回路（Human-in-the-Loop）

任何步骤都能手动干预——重处理、跳过、强制场景路由、改草稿、撤回审核、立刻发、改时间、删评论。系统永远不强制按主流程走。

## 4. 数据流

一条候选帖子的状态机：

```
discovered（捞到，scanner 写入）
    ↓
analyzing（AI 处理中）
    ├── matched_article  →  drafting  →  pending_review
    │                                          ↓ 用户审核
    │                                     approved | rejected
    │                                          ↓ approved
    │                                     scheduled（等发）
    │                                          ↓ poster 发出
    │                                       sent（已发送）
    │                                          ↓ analytics 持续采
    │                                     tracking（1h/6h/24h/72h/7d）
    │                                          ↓ 7d 后
    │                                     archived
    ├── no_match  →  archived（KB 无相关 → 触发 needs_kb_input 标记）
    └── failed   →  dead_letter（AI 处理失败，等用户手动处理）
```

## 5. 架构总览

15 个进程，PM2 全部托管，分 6 层：

```
┌─ 外部依赖 ────────────────────────────────────────────────────
│   X (Twitter) │ Dify 知识库 │ Claude Code Max │ Telegram Bot
│
├─ 采集层（24/7 不耗 AI）────────────────────────────────────────
│   scanner-browser    （登录态浏览器扫，多账号轮替）
│   scanner-3rdparty   （Apify/TweetScout 兜底）
│   customer-sync      （从外部潜客系统同步名单）
│
├─ AI 处理层（吃 AI 额度，批处理）─────────────────────────────────
│   ai-worker = Claude Code routine（每 5–10 分钟批处理 10–20 条）
│   on-demand-ai       （面板按钮 → claude -p 一次性调用）
│
├─ 知识管理层（24/7 不耗 AI）────────────────────────────────────
│   kb-publisher       （把用户补充的 KB 推到 Dify）
│   fresh-kb-indexer   （ai-worker 内置组件，未入 Dify 的本地 fresh KB）
│
├─ 发送层（24/7 不耗 AI）───────────────────────────────────────
│   scheduler          （滴灌：账号节流 + 营业时段 + 插队）
│   poster             （xactions + Chrome CDP 实际发送，记 tweet_id）
│
├─ 回收层（24/7 不耗 AI）───────────────────────────────────────
│   analytics-worker   （1h/6h/24h/72h/7d 采互动数据）
│   dm-collector       （拉所有账号 DM，归因）
│
├─ 运维层（24/7）─────────────────────────────────────────────
│   network-health     （每 5 分钟探针，发 redis pub/sub）
│   health-monitor     （检查心跳，告警）
│   watchdog           （检测「卡死但未崩」，强杀重启）
│
└─ UI 层 ──────────────────────────────────────────────────
    web-ui (Next.js)   （仅做日常运营，不承载配置编辑）
```

**关键架构决策**：

- 只有 `ai-worker` 一个进程依赖 Claude Code 额度
- `ai-worker` 是通过 `/schedule` 创建的 Claude Code routine（不是常驻进程，醒来批处理后退出）
- `network-health` 作为「全局开关」用 Redis pub/sub 通知所有 worker，worker 不再各自处理网络错误
- 所有真实发送动作经过 `scheduler` + `poster`，确保节流、多账号隔离、失败可重试

## 6. 组件详细行为

### 6.1 scanner-browser

- **职责**：用 xactions + Chrome CDP，以登录态扫 X 关键词搜索与关注账号 timeline
- **调度**：每个关键词维护「下次扫描时间」，自适应频率（命中率高 → 加密；连续空轮 → 稀疏）
- **多账号轮替**：避免单账号触发风控
- **失败处理**：连续 3 次异常 → 该账号 cooldown 1 小时
- **修补点**：扫描频率算法、关键词列表（在代码 `keywords/global.ts`）、查询变体规则

### 6.2 scanner-3rdparty

- **职责**：第三方爬取源，与 browser 互补（long-tail、深搜）
- **架构**：driver 接口预留，不锁定具体服务

### 6.3 customer-sync

- **职责**：定时调外部潜客系统 API（或接 webhook），同步进 `customers` 表
- **副作用**：新潜客 handle 自动加入 `scanner-browser` 关注列表

### 6.4 ai-worker（Claude Code routine）

- **形态**：通过 `/schedule` 创建的 routine，每 5–10 分钟自动跑一次
- **单次工作流程**：
  1. 从 `queue:ai-tasks` 拉 10–20 条 post_id
  2. 对每条 post：
     - 查 KB（Dify + 本地 fresh KB）
     - LLM 分析帖子类型/观点/场景路由
     - 若 KB 命中 → LLM 生成草稿（带 citations）
     - 若 KB 无命中 → 标记 `needs_kb_input`
     - 失败 → 写 `dead_letter`，retry_count++
  3. 更新心跳，退出
- **节流**：单次最多 20 条；队列堆积超 200 告警
- **修补点**：批大小、prompt 模板（`prompts/*.ts`）、场景路由规则（`rules/scenario-routing.ts`）

### 6.5 on-demand-ai

- **触发**：面板按钮（重新生成、立即处理、补充思路写草稿）
- **实现**：spawn `claude -p` 子进程
- **共享**：与 routine 共用同一个 prompt 库与写库逻辑，行为一致

### 6.6 kb-publisher

- **职责**：每 30 秒扫 `kb_additions WHERE status='pending'`，调 Dify API 上传
- **状态**：pending → pushing → published（或 failed → dead_letter）
- **复用**：基于现有 `dify-knowledge-base` skill

### 6.7 fresh-kb-indexer

- **形态**：ai-worker 的内置组件，不是独立进程
- **职责**：检索时优先扫 SQLite 中 24h 内的 kb_additions，填补 Dify 索引延迟
- **过期**：24h 后认为 Dify 已索引，本地索引退出

### 6.8 scheduler

- **每 30 秒跑一次**
- **核心算法**：每个账号独立计算 target_send_at
  - `base = max(NOW + min_interval, account.last_sent_at + min_interval)`
  - 落在营业时段外 → 推到下一个营业时段开始
  - 当天已发数 >= daily_limit → 推到明天
- **手动插队**：用户点「立刻发」→ target_send_at = NOW + 5s，同账号其他 scheduled 顺延
- **修补点**：滴灌算法（`rules/scheduling.ts`）

### 6.9 poster

- **消费**：`queue:send-tasks`
- **幂等**：用 `idempotency_key` 查 `sent` 表，已存在则跳过
- **失败**：3 次失败 → dead_letter；连续 3 次同账号失败 → 账号 cooldown 1 小时
- **副作用**：成功后调度 1h/6h/24h/72h/7d 的 analytics 采集

### 6.10 analytics-worker

- **每分钟扫 Redis ZSET 取到点的快照任务**
- **采集**：likes、retweets、replies、bookmarks
- **副作用**：发现新 reply → 这些 reply 也进 `posts` 表，进入「我们评论被人回」二次流

### 6.11 dm-collector

- **每 5 分钟轮询所有账号 DM inbox**
- **归因**：尝试关联 DM 发件人到「曾经我们评论过的帖子下出现」的 engagement 记录
- **范围**：仅收集和展示，不做自动回复

### 6.12 network-health

- **每 5 分钟探测**：HEAD x.com、HEAD api.dify.ai、HEAD 1.1.1.1
- **状态推断**：
  - 三个都通 → HEALTHY
  - 1.1.1.1 通但 x.com 不通 → DEGRADED_X
  - 1.1.1.1 通但 dify 不通 → DEGRADED_DIFY
  - 都不通 → DOWN
- **广播**：Redis pub/sub 频道 `network-status`
- **所有 worker** 在主循环开头读取该状态，决定继续/暂停/冬眠

### 6.13 health-monitor

- **每分钟扫 `system_health` 表**：
  - 进程心跳超 5 分钟 → Telegram 告警
  - 队列深度突涨 → 告警
  - dead_letter 新增 → 告警
  - network 持续 DOWN > 10 分钟 → 告警

### 6.14 watchdog

- **每 30 秒检查每个 PID**：
  - CPU 时间是否还在增长（卡死时通常 CPU 0）
  - 心跳是否过期
- **动作**：满足卡死条件 → kill -9 → PM2 自动重启

### 6.15 web-ui (Next.js)

仅承载日常运营，不做配置编辑。页面分组：

- **工作流**：概览 / 待审 / 已审 / 已发
- **数据**：互动数据 / 私信
- **资产**：KB 补充 / Playbook（只读 + 手动新增）/ 客户名单（只读）
- **运维**：系统状态 / 日志 / 死信
- 不包括：prompt 编辑、规则编辑、关键词编辑（由 Claude 改代码完成）

## 7. 数据模型

存储分两块：**SQLite（主存储，崩了重启不丢）+ Redis（队列与状态广播，可重建）**。

### 7.1 SQLite 表

| 表 | 用途 | 关键字段 |
|---|---|---|
| `accounts` | X 账号注册 | id, handle, role, cookies_path, daily_limit, min_interval_min, business_hours, cooldown_until |
| `customers` | 潜客名单（外部同步）| id, x_handle, tags[], stage, source_system_id |
| `articles` | Dify 文章索引（轻引用，不存全文）| id, dify_doc_id, title, url, lang, published_at |
| `article_keywords` | 文章专属关键词 | article_id, term, ai_extracted, approved |
| `posts` | 候选帖子 | id, tweet_id, author_handle, text, posted_at, lang, source, scenario_hint, status, trace_id |
| `post_analysis` | AI 分析结果 | post_id, type, viewpoint, scenario, kb_match_score, kb_chunks[], analyzed_at, prompt_version, playbook_candidates[] |
| `drafts` | 回复草稿 | id, post_id, account_id, content, format, citations[], strategy, status, idempotency_key, playbook_id |
| `scheduled` | 已审核排程 | draft_id, target_send_at, priority, account_id |
| `sent` | 已发送记录 | id, draft_id, tweet_id, sent_at, account_id |
| `engagement` | 互动数据快照 | sent_id, snapshot_at, likes, retweets, replies, bookmarks, profile_clicks, link_clicks |
| `dms` | 私信收集 | id, account_id, from_handle, content, received_at, attributed_to_sent_id |
| `reply_playbooks` | 回复思路库 | id, name, description, trigger_signals, approach, kb_anchors[], example_drafts[], effectiveness_score, source, version, parent_id, approved_by_user, enabled, use_count |
| `kb_additions` | KB 主动补充 | id, triggered_by_post_id, triggered_by_draft_id, title, content, tags[], lang, source, dify_doc_id, dify_indexed_at, status |
| `audit_log` | 操作日志 | id, actor, action, target_type, target_id, payload, at, trace_id |
| `dead_letter` | 失败任务 | id, task_type, payload, last_error, retry_count, moved_at |
| `system_health` | 进程心跳 | process_name, last_heartbeat, status, last_error |

### 7.2 Redis 键

```
queue:scan-tasks           # BullMQ：待扫描任务
queue:ai-tasks             # 待 AI 处理的 post_id 列表
queue:send-tasks           # 待发送 draft_id（scheduler 推、poster 拉）
queue:analytics-tasks      # ZSET，按 fire_at 排序的采集任务
network-status             # pub/sub 频道
metrics:*                  # 轻量计数器（今日发送量、AI 调用次数）
```

### 7.3 不在数据库里的「配置」

以下都是代码文件，由 git 版本化：

- 全局关键词词典（`keywords/global.ts`）
- 查询变体扩展规则（`keywords/query-variants.ts`）
- 所有 LLM prompt 模板（`prompts/*.ts`）
- 滴灌算法 / 账号选择规则 / 场景路由规则（`rules/*.ts`）
- 网络探针目标列表
- 重试策略 / 退避时间

## 8. 关键流程示例

### 8.1 一条帖子的完整生命周期

```
[scanner-browser] 抓到一条 tweet
  → INSERT posts (status='discovered', trace_id=新生成)
  → ENQUEUE queue:ai-tasks (post.id)

[ai-worker / Claude Code routine] 醒来批处理
  → 读 queue:ai-tasks 取 15 条
  → 对每条：用 Dify + fresh KB 检索 → LLM 分析（一次调用）
  → INSERT post_analysis
  → 若 matched_article → LLM 生成草稿（一次调用）
    → INSERT drafts (status='pending', citations=[chunk_ids])
  → UPDATE posts.status = 'analyzing' → 'matched_article' 或 'no_match'

[web-ui] 用户打开面板
  → SELECT drafts WHERE status='pending'
  → 用户点「通过」→ UPDATE drafts.status='approved'
  → INSERT scheduled (target_send_at 由 scheduler 计算)

[scheduler] 持续监控
  → 当 NOW() >= target_send_at 时
  → ENQUEUE queue:send-tasks

[poster] 拉 send-task
  → 切换到 draft.account_id 对应 cookies
  → 通过 xactions 发评论
  → INSERT sent (tweet_id, sent_at)
  → UPDATE drafts.status='sent'
  → SCHEDULE queue:analytics-tasks（5 个时间点）

[analytics-worker] 按 1h/6h/24h/72h/7d
  → 拉 tweet 详情
  → INSERT engagement

[7 天后] 所有快照采完 → UPDATE posts.status='archived'
```

### 8.2 KB 主动完善流程

```
场景 A：用户在审核草稿时发现 KB 缺料
  → 面板「补充知识」按钮 → 弹出表单（预填 triggered_by_draft_id）
  → 用户填写 title + content + tags → 提交
  → INSERT kb_additions (status='pending')
  
场景 B：AI 处理时标记 needs_kb_input
  → ai-worker 在 post_analysis 里写 needs_kb_input=true
  → 面板「KB 缺口」列表展示这些帖子
  → 用户从列表点进去补充

[kb-publisher] 每 30 秒扫
  → 找到 status='pending' 记录
  → 调 Dify API 上传
  → 拿到 dify_doc_id → status='pushing'
  → 轮询 Dify 索引完成 → status='published'

[fresh-kb-indexer]（ai-worker 内置）
  → 下次检索时优先扫 24h 内的 kb_additions
  → 即写即用，不需等 Dify 完成索引
```

## 9. Reply Playbook（回复思路库）

### 9.1 现阶段范围

- 表 `reply_playbooks` 建好，所有字段齐全
- 用户可以从已审核草稿手动「保存为 playbook」
- 用户可以在面板里浏览、启用/禁用、编辑 playbook
- **AI 自动匹配复用功能暂不开启**（`system_rules.playbook_matching_mode = 'manual_only'`）

### 9.2 预留的扩展点

将来启用自动复用时只需要：

1. 在 ai-worker 中实现 `findMatchingPlaybooks(post, analysis)` 函数（当前是空函数）
2. 修改一行配置：`playbook_matching_mode = 'auto'`

### 9.3 反哺数据

每个 sent 记录通过 `drafts.playbook_id` → `reply_playbooks` 关联。analytics-worker 自动累加每个 playbook 的 effectiveness_score（用过的所有 sent 互动均值）。

## 10. 网络稳健层

### 10.1 4 层防御（专线后简化版）

```
第 4 层：Telegram 告警        ─ 严重故障通知
第 3 层：PM2 进程守护          ─ 真崩了重启
第 2 层：智能退避 + 熔断       ─ 防恢复后请求雪崩
第 1 层：优雅暂停 / 恢复       ─ network-health 总开关驱动
第 0 层：网络健康探针          ─ 每 5 分钟探测，pub/sub 广播
```

### 10.2 关键设计

- 所有 HTTP 请求强制 timeout（默认 30 秒）
- 所有任务幂等设计（基于 idempotency_key）
- 连续失败 5 次 → 死信队列，不再自动重试
- Mac 网络事件订阅（`scutil --nwi`）：Wi-Fi 切换时主动暂停所有 worker

## 11. 面板布局

侧栏分组（确认布局 B），不再承载配置编辑：

```
工作流
  📊 概览（首页：今日战况数据）
  📥 待审 (N)
  📤 已审 (N)
  ✅ 已发

数据
  📈 互动数据
  💌 私信

资产
  📚 KB 补充
  🎯 Playbook
  👥 客户名单

运维
  ❤️ 系统状态（每个进程开关）
  📜 日志
  ⚠️ 死信
```

## 12. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 编程语言 | TypeScript（Node.js）| 与现有 xactions、MCP 生态一致；用户已用 PM2 |
| Web 框架 | Next.js 14 | App Router；前后端一体；适合内部工具 |
| 主存储 | SQLite（better-sqlite3）| 轻量；本地无运维；事务可靠 |
| 队列与广播 | Redis（BullMQ + pub/sub）| 行业标准；brew install 即用 |
| X 操作 | xactions（已有）+ Chrome CDP | 复用现有基础设施 |
| KB 集成 | Dify HTTP API（复用 dify-knowledge-base skill）| 已有集成 |
| 进程守护 | PM2（已装）| ecosystem.config.js 管理 15 个进程 |
| 系统服务 | launchd + caffeinate | macOS 原生 |
| AI 调用 | Claude Code Max（routine + claude -p）| 用户无 API key |
| 通知 | Telegram Bot（已配置）| 复用现有 |

## 13. 项目代码结构（Patch-Friendly Layout）

```
x-monitor/
├── apps/
│   ├── web-ui/                  # Next.js 14 dashboard
│   ├── scanner-browser/
│   ├── scanner-3rdparty/
│   ├── customer-sync/
│   ├── ai-worker/               # Claude Code routine entry
│   ├── kb-publisher/
│   ├── scheduler/
│   ├── poster/
│   ├── analytics-worker/
│   ├── dm-collector/
│   ├── network-health/
│   ├── health-monitor/
│   └── watchdog/
│
├── packages/
│   ├── core/                    # 共享类型、DB schema、工具函数
│   ├── db/                      # SQLite schema + 迁移
│   ├── queue/                   # Redis 队列封装
│   ├── x-client/                # xactions + CDP 封装（多账号、登录态）
│   ├── dify-client/             # Dify API 封装
│   ├── claude-client/           # claude -p / routine 封装
│   ├── prompts/                 # 所有 LLM prompt（按用途分文件）
│   │   ├── analyze-post.ts
│   │   ├── draft-from-article.ts
│   │   ├── draft-from-kb.ts
│   │   ├── discuss-direction.ts
│   │   └── extract-keywords.ts
│   ├── rules/                   # 业务规则（按用途分文件）
│   │   ├── scenario-routing.ts
│   │   ├── scheduling.ts
│   │   ├── account-selection.ts
│   │   └── matching-threshold.ts
│   ├── keywords/                # 关键词词典与变体规则
│   │   ├── global.ts
│   │   └── query-variants.ts
│   └── observability/           # 日志、trace_id、指标
│
├── scripts/
│   ├── inspect.ts               # CLI: inspect post / drafts / health
│   ├── replay.ts                # CLI: 重放 AI 处理（dry-run）
│   ├── seed-db.ts               # 初始化数据库
│   └── ecosystem.config.js      # PM2 配置
│
├── docs/
│   ├── superpowers/specs/       # 设计文档
│   └── runbook.md               # 运维手册
│
├── tests/
│   ├── fixtures/                # 典型 post 数据集
│   └── prompts.test.ts          # prompt 行为测试
│
└── package.json                 # pnpm workspace
```

## 14. 修补流程（用户工作流）

```
用户发现问题（如「这条评论太硬广」）
   ↓
用户告诉 Claude（在 Claude Code 会话中）
   ↓
Claude 定位文件（如 prompts/draft-from-article.ts）
   ↓
Claude 修改 + 跑测试 fixture 看影响
   ↓
重启对应进程（pm2 restart ai-worker）
   ↓
配置生效，下一条新帖子按新规则处理
```

**关键工具支撑**：

- `npm run inspect post <tweet_id>`：看一条帖子全生命周期
- `npm run replay post <tweet_id>`：用当前 prompt/rules 重放 AI 处理（不真发）
- `npm run test:prompts`：跑所有 fixture 看 prompt 行为变化
- `pm2 logs <process>`：实时日志
- 面板「死信」「日志」「系统状态」页：用户自己看不需要 Claude

## 15. 部署与运行

### 15.1 部署目标

本地 Mac 24/7 运行。

- launchd plist（用户级 LaunchAgent）开机自启 PM2
- caffeinate 防系统休眠
- 翻墙网络专线接入

### 15.2 ecosystem.config.js 概要

15 个进程，每个独立配置：
- max_memory_restart（防内存泄漏）
- min_uptime（避免反复重启）
- restart_delay
- error_log + out_log

### 15.3 ai-worker 的 routine 部署

通过 `/schedule create` 创建一个 cron 触发的 routine（每 5 分钟），routine 内容：
1. 连接本地 SQLite + Redis
2. 拉 ai-tasks 队列
3. 处理一批
4. 退出

不进 PM2（Claude Code 远程托管）。

## 16. 待澄清 / 推迟决定

以下问题在实施过程中再定，不阻塞设计：

1. **scanner-3rdparty 的具体服务选型**（Apify / TweetScout / 其他）—— 接口已抽象
2. **滴灌参数具体值**（min_interval、daily_limit、business_hours）—— 上线后调优
3. **playbook 自动匹配的阈值与策略**—— 等用户用一段时间再设计
4. **多账号在三个场景下的默认分配规则**—— 实施时与用户讨论
5. **死信队列的 UI 详细形态**—— 实施时设计
6. **互动数据反哺机制的具体实现**—— 第二阶段
7. **场景 3 中「不相关但私人化」的判断逻辑**—— 实施时通过 prompt 调优

## 17. 不在本设计范围内的事项

- 给系统加权限/团队账号（架构预留，不实现）
- DM 自动回复（明确不做，仅收集）
- Playbook 自动匹配复用（架构预留，初期手动）
- 互动数据自学习（第二阶段）
- 跨平台扩展（Bluesky / Mastodon / 微博）
- 移动端面板

## 18. 验收准则

设计文档的成功定义：

1. Claude 拿到这份文档能直接进入「写实施计划」（writing-plans 阶段）
2. 文档列出的所有「修补点」对应的代码文件路径清晰可定位
3. 每个组件的失败模式与处理路径已说明
4. 用户阅读后能理解：开机后系统每分钟在干什么、哪里出问题会怎么表现、自己能在面板上做哪些操作

---

## 附录 A：术语表

| 术语 | 含义 |
|---|---|
| KB | Knowledge Base，特指 Dify 知识库 |
| RAG | Retrieval-Augmented Generation |
| trace_id | 一条帖子全链路日志关联 ID |
| idempotency_key | 幂等键，防止重复操作 |
| dead letter | 失败任务归档队列 |
| dry-run | 模拟执行，不产生真实副作用 |
| routine | Claude Code 的远程定时任务 |
| cooldown | 账号冷却期，期间不发送 |

---

**文档版本**：v1.0
**下一步**：spec-document-reviewer 审查 → 用户最终 review → 进入 writing-plans
