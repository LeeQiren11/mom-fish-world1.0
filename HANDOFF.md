# Mõm Fish World (摸鱼世界) — 交接文档 / Handoff

> 给接手的 AI 或工程师:请先通读本文,再动代码。
> 生成日期: 2026-11-21 | 更新: 2026-11-21(第二轮:真实 Supabase 联调 + P0-1/P0-2 + 集成测试)
> 当前状态: **已在真实 Supabase(Postgres + PostgREST)上跑通 8 人对局;身份改由服务端校验;
> Game 1 数值重做;`lib/werewolf.ts` 有 27 条集成测试 + 7 条金币/数值测试;类型检查 + 生产构建通过。
> 仍未验证:Zalo OA 真机推送、Zalo Mini App 容器内运行、真机 UI 手工点测。**

## 0. 本轮改了什么(先看这里)

| 项目 | 之前 | 现在 |
| --- | --- | --- |
| 8 人对局 | 未联调 | 真实 DB 上跑通(见第 5 节),修掉 2 个真实 bug |
| 并发加入 | 8 人同时点"进房",4 人报 `unique(room_id, seat)` 冲突,房间碎片化成 3+1 人 | SQL 函数 `werewolf_take_seat` 行锁发号,8/8 成功 |
| 匹配房间 | 冷启动时 8 个并发请求各建一个空房(8 个房间各 1 人) | SQL 函数 `werewolf_find_or_create_room` + advisory lock,只建 1 个房 |
| 开局竞态 | 最后两个加入者可能同时 `startRoom`,重复分配角色 | `update ... where status='waiting'` 抢锁,只有一个赢家分配角色 |
| 身份(P0-1) | `zaloId` 来自 localStorage 的 `guest-xxxx`,可伪造;`playerId` 由客户端提交,知道 id 就能操控别人 | zmp-sdk `getAccessToken()/getUserID()` → 服务端 `graph.zalo.me` 校验 → HMAC 签名 httpOnly Cookie;API 只认 session,`playerId` 由服务端反查 |
| Game 1 数值(P0-2) | 还清 3 亿的概率 ≈ 0.17%;金币在还掉 1200 万时就撞 1200 上限 | 收益/风险重排,模拟胜率:随机玩 6%、合理选 34%;金币按还款进度线性给 0–1200 |
| 测试 | 无 | `npm test` 34 条测试(内存假 Supabase);`npm run e2e` 25 项真实 DB 校验;`npm run e2e:api` 16 项 HTTP 校验 |

## 0.1 第三轮：代码审查修复（2026-11-21）

| # | 问题 | 修复 |
| --- | --- | --- |
| 1 | `tsc` 报错（`scripts/e2e-api.ts` 的 `speakerIdx`）会让 Vercel 构建失败 | 删掉残留行；`tsconfig.json` 排除 scripts/tests，另加 `tsconfig.dev.json`，`npm run typecheck` 两份都跑 |
| 2 | RPC 函数 anon 可调用，绕过 RLS | `supabase.sql` 对两个函数 `revoke ... from public, anon, authenticated` |
| 3 | Cookie 在 Mini App 跨域下带不上 | `/api/auth` 返回 `token`；客户端用 `Authorization: Bearer`；`getSession` 两者都认；新增 `middleware.ts`（CORS，`ALLOWED_ORIGINS`）；`NEXT_PUBLIC_API_BASE` |
| 4 | 20:50 开始的回合 deadline=21:05，次日 8:30 被判超时 | `computeTurn`：deadline 落入夜间则顺延到次日 8:45 |
| 5 | 发言/超时/查验有竞态（重复消息、重复票） | `has_spoken=false` / `seer_checked_round<当前轮` 条件更新抢占；`checkTimeout` 先重读房间；新增唯一索引 `uq_messages_once_per_turn` |
| 6 | 推送无超时，会拖住出牌请求 | 4 秒超时，`advanceTurn` 里吞掉推送异常 |
| 7 | 预言家查验结果刷新即丢 | 新列 `seer_results jsonb`，`getState` 只对预言家本人返回 |
| 8 | 打开页面就自动占座 | 改成 `resume`（只找已有房间）；cron 清理 24h 未满的 waiting 房间和 7 天前的 finished 房间 |
| 9 | 机器人按钮线上也显示 | 仅 `NEXT_PUBLIC_DEV_BOTS=1` 显示；示例 env 默认注释掉 |
| 11/12/13 | 畸形 cookie 抛 500、cron 非恒定时间比较、`getAccessToken` 无超时、轮询报错不消失 | 均已修 |
| P2 | Game 1/3/4 没有“再来一局” | 已加 |

**已有数据库必须先跑 `supabase.sql` 里的 “Migration” 段**（加 `seer_results` 列）和唯一索引，再部署代码。

测试：`npm test` 40 条（新增 `tests/regression.test.ts` 6 条）；`npm run typecheck` 通过；`next build` 通过。

**本轮没做 / 仍需人确认**：
- 狼人杀金币只有 100（`recordResult('werewolf', 1000, …)` 经 `/10`），与 Game 1 的 1200 不一致，需产品确认；
- 没有“离开房间”（`take_seat` 用 `max(seat)+1`，删人会让座位出现空洞，需连同 SQL 一起改）；
- zmp-sdk 取 token 前是否需要先 `authorize` scope，要在真机确认；
- Mini App 前端本身是否能直接复用这个 Next.js 项目（ZMP 需要单独打包上传）。

## 1. 项目一句话

越南上班族摸鱼小游戏合集(Zalo Mini App 方向):5 个小游戏 + 1 个周总结页。
UI **越南语为主、简体中文为副标题**(方便中国团队看)。移动端优先,最大宽度 448px(`max-w-md`)居中,扁平卡通风格,`rounded-3xl` + 阴影。

## 2. 技术栈(必须遵守,不要擅自更换)

- Next.js **14.2.35** App Router + TypeScript(strict)+ Tailwind CSS 3
- Supabase(PostgreSQL),**不要用 Prisma**;只在服务端用 service role key
- 部署 Vercel,Cron 每 5 分钟(`vercel.json`)
- 不做真实支付;只做金币 + 广告占位
- 本轮新增唯一依赖 `zmp-sdk`(Zalo Mini App 官方 SDK,用于拿 access token),`tsx` 仅作 devDependency 跑测试/脚本

## 3. 文件结构

```
app/
  layout.tsx                 根布局(Nunito 字体,max-w-md 居中)
  page.tsx                   主页:金币、5 个游戏卡片、周总结入口、QR 占位
  game/[slug]/page.tsx       路由分发:rebirth|boss|milktea|duck|werewolf|weekly
  api/auth/route.ts          【新】POST 登录(校验 Zalo token / dev guest)、GET 当前 session、DELETE 登出
  api/werewolf/route.ts      狼人杀 API(join/state/speak/seer/bots),身份取自 session
  api/cron/werewolf/route.ts Cron 入口:checkTimeout + runPushSchedule
components/
  GameShell.tsx              返回按钮 + 标题 + 底部蓝色分享按钮(共用壳)
  Game1_Rebirth.tsx ... Game4_Duck.tsx   四个单机游戏
  Game5_Werewolf.tsx         异步狼人杀 UI(轮询 8 秒);先 ensureSession() 再进房
  WerewolfTimer.tsx          回合倒计时 / 夜间暂停展示
  WeeklySummary.tsx          周总结(读本地战绩)
lib/
  games.ts                   游戏数据与常量、calcCoins、calcCoinsByProgress、formatVND
  coins.ts                   金币/战绩/广告(localStorage)+ useStore hook
  werewolf.ts                异步狼人杀核心逻辑(服务端)
  session.ts                【新】HMAC 签名 session token + Cookie 读写
  zalo-auth.ts              【新】服务端校验 Zalo access token(graph.zalo.me)
  client-auth.ts            【新】客户端:zmp-sdk 拿 token → 换 session
  zalo-push.ts               Zalo OA 推送 maybePush(1 天最多 4 条)
  supabase.ts                服务端 admin client
tests/
  fake-supabase.ts           内存版 Supabase(模拟 PostgREST 子集 + 2 个 RPC)
  werewolf.test.ts           27 条集成测试(整局/平票/狼胜/AFK/预言家/夜间暂停/越权)
  games.test.ts              7 条金币与 Game1 数值测试
scripts/
  e2e-werewolf.ts            真实 DB 上跑完整对局 + 并发/超时/新局
  e2e-api.ts                 走 HTTP 打 API 的端到端(身份、越权、整局)
  probe-race.ts              只测并发 join 的小探针
supabase.sql                 建表 + 索引 + RLS + 2 个 RPC 函数
vercel.json                  Cron: */5 * * * *
.env.local.example           环境变量占位
```

## 4. 环境变量

| 变量 | 用途 |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 服务端访问数据库(绝不能暴露给前端) |
| `SESSION_SECRET` | **（新，必填）** 给 session cookie 签名,≥16 字符。没配会直接报错 |
| `CRON_SECRET` | Cron 接口鉴权,Vercel 会发 `Authorization: Bearer $CRON_SECRET` |
| `ZALO_OA_ACCESS_TOKEN` | Zalo OA 推送 token(无则不推,不报错) |
| `ZALO_APP_SECRET` | （可选）Zalo Mini App 的 App Secret,配上则校验 token 时带 `appsecret_proof` |
| `NEXT_PUBLIC_APP_URL` | 分享链接,默认 `https://zalo.me/momfishworld` |
| `ALLOW_GUEST_SESSION` | `1` 时允许"访客登录"(仅浏览器调试用),**上线前必须删** |
| `ALLOW_DEV_BOTS` | `1` 时允许"添加机器人"测试按钮,**上线前删除** |

## 5. 已验证 / 未验证

已验证(本轮实际跑过):
- 真实 Supabase 协议栈(Postgres 18 + PostgREST 16 + service_role JWT),执行本仓库 `supabase.sql` 建表建函数
- 8 人**并发** join → 1 个房间、8 个不冲突座位、自动开局、2 狼 + 1 预言家 + 5 村民
- 完整对局:8 人 × 2 轮发言 + 投票 → 两狼被投出 → 村民胜;15 条消息、座位/角色/胜负一致
- 空票 3 轮 → 狼胜;平票 → 无人出局(单测覆盖)
- 超时 15 分钟 → 自动跳过 + `is_afk=true` + 写日志;该玩家下一轮 interval = 30 分钟
- 夜间 21:00–8:30:deadline 顺延到次日 8:45,`checkTimeout` 直接 paused
- 身份:无 cookie → 401;篡改 cookie → 401;body 里塞 `zaloId/playerId` 被忽略;非本房 session → 403
- Cron:无 Bearer → 401;正确 Bearer → 200
- `tsc --noEmit` 零报错;`next build` 成功(5 个路由,含新增 `/api/auth`)
- 金币:Game 1 胜率/金币分布用 20 万次蒙特卡洛验证(见第 7 节)

未验证(仍需人做):
- 真实 Zalo OA 推送(没有 token);Zalo Mini App 容器内 `getAccessToken()` 真机流程
- 浏览器/真机 UI 手工点测(只跑了 API 层与构建)
- Vercel Cron(需 Pro;或换 cron-job.org / Supabase `pg_cron`)

## 6. 狼人杀规则

PRD 规定: 8 人局(2 狼 + 1 预言家 + 5 村民)、3 轮、异步;间隔 `getTurnInterval`:
21:00–8:30 → 120(暂停);12:00–13:00 → 10;9:00–12:00 与 17:00–21:00 → 15;13:00–17:00 → 30。
超时 15 分钟没发言 → `checkTimeout()` 自动跳过 + `is_afk=true` + 该玩家下一轮间隔变 30 分钟。
`maybePush()` 查 `werewolf_push_logs`,同一 zalo 用户 1 天最多 4 条,21:00 后不推。

补充规则(与实现一致):
- 每轮每个存活玩家按 `seat` 顺序各发言一次,可附带投票;全员发完 → 得票最多者出局,**平票则无人出局**
- 狼全死 → 村民胜;狼数 ≥ 其余存活人数 → 狼胜;**跑完 3 轮狼仍存活 → 狼胜**
- 预言家每轮可查验 1 人(`seer_checked_round` 字段在服务端限制)
- 夜间(21:00–8:30)`checkTimeout` 不处理,新回合 deadline = 次日 8:30 + 15 分钟,`turn_interval_minutes` 存 120 供前端展示"暂停"
- 8:30–9:00 PRD 没定义,按 15 分钟处理
- 相比 PRD 表结构,额外加了 `werewolf_players.seat` / `seer_checked_round`、`werewolf_rooms.winner`
- 所有读写走 `/api/werewolf`(service role);表开了 RLS 但**没有 policy**,前端拿不到别人的身份
- 时区:Vercel 是 UTC,代码统一用 UTC+7 换算(`toVN` 思路,见 `vnMinutes`)

### 6.1 并发相关的实现(本轮新增,改动时注意别退回去)

- **进房发号**:`supabase.sql` 的 `werewolf_take_seat(room_id, zalo_id, name, max)`。
  `select ... for update` 锁住房间行 → 用 `max(seat)+1` 发号 → 满员/已开局则抛 `room_full` / `room_not_waiting`。
  `lib/werewolf.ts` 通过 `sb.rpc()` 调用,把 `room_full|room_not_waiting` 当成"换下一个房间"。
- **匹配房间**:`werewolf_find_or_create_room(max)`,advisory lock 串行化,返回一个还有空位的 `waiting` 房,没有就新建。
  这解决"8 人冷启动各建一个房"的问题。
- **开局**:`startRoom()` 用 `update ... set status='playing' where id=? and status='waiting'` 抢旗,
  只有返回 1 行的那次调用才分配角色 → 不会重复洗牌。

## 7. 金币规则

- `calcCoins(score) = max(0, min(1200, floor(score/10)))`,其余游戏沿用
- **`calcCoinsByProgress(paid, target) = round(1200 × paid/target)`（新）**:给"有明确金额目标"的游戏用,
  解决"还掉一点点就撞 1200 上限"的问题。Game 1 用这个:`paid = 3亿 - 剩余债务`
- Game 3: `score = 收入/100`;Game 2: 得分直接作 score(负分按 0);Game 4 / Game 5 为固定分档
- `recordResult(gameId, score, win, coinsOverride?)` 第 4 个参数可显式指定金币(上一条用得到)

### 7.1 Game 1 数值(P0-2 重做)

| 职业 | 收益 | 失败率 | 失败罚金 |
| --- | --- | --- | --- |
| 送外卖 Giao đồ ăn | 30,000,000đ | 8% | 0 |
| 摆摊奶茶 Bán trà sữa | 45,000,000đ | 25% | 0 |
| 炒股 Chơi chứng khoán | 90,000,000đ | 55% | 债务 +40,000,000đ |
| 摸鱼 Mò cá | 12,000,000đ | 0% | 0 |

债务 3 亿 / 7 天 / 每天 1 个选择。20 万次模拟结果:

| 玩法 | 通关率 |
| --- | --- |
| 随机乱选 | 6.1% |
| 一直送外卖 | 0%(7×3000 万 < 3 亿,这是剧情:打工还不了 3 亿) |
| 一直摆摊奶茶 | 12.2% |
| 一直 all-in 炒股 | 17.6% |
| 合理策略(缺钱才炒股,否则摆摊) | 33.6% |

设计意图:稳(摆摊)是基线,炒股是"追差额"的高风险选项,摸鱼是保底小钱;金币随还款进度线性给,
输的局也有 200–800 金币,不再是"0 或满格"。

## 8. 已知问题与待办(按优先级)

**P0 — 上线前必须处理**
1. ~~身份是占位~~ **已做**(2026-11-21):见第 4 节 `SESSION_SECRET` / 第 6.1 节。
   上线动作:配好 `SESSION_SECRET`,**删掉 `ALLOW_GUEST_SESSION`**,在 Zalo Mini App 后台确认 scope `scope.userinfo`。
2. ~~Game 1 数值几乎无解~~ **已做**:见 7.1。上线前请产品再过一眼胜率是否符合预期。
3. ~~真实环境联调完整对局~~ **已做**:见第 5 节。(Zalo 真机部分仍未验证)
4. Vercel Cron 每 5 分钟需要 **Pro 套餐**(Hobby 只能每天一次)。替代:cron-job.org 或 Supabase `pg_cron`
   定时请求 `/api/cron/werewolf`(带 Bearer 头)。

**P1**
5. ~~并发 join / startRoom 竞态~~ **已做**:见 6.1。
6. `turn_reminder` 推送文案里的指控人固定为 "Lan"(PRD 原文)。可改成真实的上一位指控者,`maybePush` 已有 `accuser` 参数。
7. 狼人杀目前是轮询(8 秒)。可改 Supabase Realtime,但注意 RLS 无 policy 的前提(需要服务端中转或加只读 policy)。
8. 金币/战绩同步到 `user_coins` / `game_logs`,以防清缓存丢失。
9. 周总结的 "TOP X%" 是占位估算,没有全服数据。
10. 分享按钮用 `navigator.share` / 剪贴板;Zalo Mini App 内应换 zmp-sdk 的 `openShareSheet`(代码里有 TODO)。
11. 清理机制:长期 `waiting` 的房间、已 `finished` 的旧房间没有清理任务。
12. **（新）** `/api/auth` 与 `/api/werewolf` 没有限流。Mini App 流量上来后建议加(Upstash 或 Vercel 中间件)。
13. **（新）** `graph.zalo.me` 校验结果没有缓存,每次登录多一次外网请求;可加 10 分钟内存缓存。

**P2**
14. 去掉/隐藏"添加机器人"按钮,删除 `ALLOW_DEV_BOTS`。
15. 真实 QR 码图(目前是占位框)。
16. 广告是占位(+50 金币,每天最多 10 次),未接真实广告 SDK。
17. ~~无自动化测试~~ **已做**:`npm test` / `npm run e2e` / `npm run e2e:api`。
18. **（新）** `startRoom` 抢到开局旗后若分配角色失败,房间会停在 `playing` 且角色为空。概率极低,
    可在 cron 里加一个"playing 但有人 role=null → 重新分配"的兜底。

## 9. 本地运行 / 部署

```bash
npm install
cp .env.local.example .env.local     # 填入真实值(至少 SUPABASE_*, SESSION_SECRET)
# Supabase Dashboard → SQL Editor → 粘贴 supabase.sql → Run
npm run dev                           # http://localhost:3000
npm run typecheck
npm test                              # 34 条测试(内存假 DB,不需要网络)
npm run e2e                           # 真实 DB 上跑整局 + 并发 + 超时(需要 .env.local)
npm run e2e:api                       # 需要 dev server 已启动

# 部署
vercel --prod
# 手动触发 Cron 自检:
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/werewolf
```

### 9.1 没有 Supabase 账号时怎么联调(本轮用的方式)

工作区里的 `.dev-stack/` 是一个**本地 Supabase 兼容栈**,不是云上 Supabase,但走的是同一套协议
(Postgres + PostgREST + JWT role `service_role`),代码与 `supabase.sql` 完全不用改:

```bash
cd .dev-stack
./start.sh          # Postgres(55432) + PostgREST(3001) + proxy(54321)
```

然后把 `SUPABASE_URL=http://127.0.0.1:54321`、`SUPABASE_SERVICE_ROLE_KEY=<jwt.out.json 的 service>`
写进 `.env.local` 即可。换成云上 Supabase 时只改这两个变量。
(该目录不在 git 里,也没有被 `npm` 依赖;真机/生产不需要它。)

## 10. 编码约定(接手请保持)

- 所有用户可见文字:**越南语在前,中文副标题在后**,用 ` • ` 分隔(例:`CHIA SẺ KẾT QUẢ • 分享结果`);越南语必须带正确声调符号,中文用简体
- 每个游戏页:顶部返回按钮,中间标题(越南语大标题 + 中文小副标题),底部蓝色分享按钮——这些都在 `GameShell`,新游戏直接套用
- Tailwind 类名必须写完整字符串(不要拼接),否则不会被打包
- 数据库只在服务端访问;不要把 service role key 放进任何 `NEXT_PUBLIC_*`
- 不要引入 Prisma,不要加真实支付
- （新）**任何用户身份都必须来自服务端 session**,不要在 API 里接受 `zaloId` / `playerId` 这类客户端字段

## 11. 给接手 AI 的第一条指令(可直接复制)

> 先阅读 HANDOFF.md 与 PRD,然后:(1) 在真实 Supabase 上跑通一局 8 人狼人杀,修复发现的 bug;(2) 处理 P0 第 1、2 项;(3) 为 lib/werewolf.ts 写集成测试。保持第 10 节的约定,不要改变技术栈。
