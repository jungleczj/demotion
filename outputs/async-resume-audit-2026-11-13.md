# 后台任务恢复与并发停止调查

日期：2026-11-13。范围：GoMotion MVP 的前端任务订阅、项目持久化、本地生产管理器和云端生产管理器。

本轮修复了云端控制层四个可重复的竞态，并补齐准入中断与并发重试的保护检查。相关离线回归 **44/44 通过**。这些结果证明实现层状态行为；本轮没有以真实活动任务执行浏览器离页、刷新、返回或停止验收。

## 最初四个失败证据

使用真实 `createCloudProductions` 与 `createCloudAuth`，仅将时钟、存储和执行器替换为内存适配器。没有加载真实凭据，没有模型、素材或云端请求。隔离复现脚本保存在 `/private/tmp/gomotion-async-resume-audit-2026-11-13/cloud-races.test.mjs`。

| 问题 | 修复前的确定性复现 | 影响与根因 |
| --- | --- | --- |
| 跨任务增量游标遗漏终态 | 两个任务在同毫秒更新。先轮询到第二任务后，第一任务以相同 `updatedAt=1794400000003` 完成。持久状态为 `incomplete`，继续增量轮询返回 0 条；`after=0` 才重新读到它。 | 云端的 `updatedAt` 只对单个任务递增，不能作为全局变化序号；`updatedAt > after` 会永久漏掉另一任务的终态。 |
| 停止后立刻重做漏停旧执行 | attempt 1 启动尚未返回时停止；立即提交 attempt 2；最后放行 attempt 1。实际启动 `[1,2]`，当前执行为 attempt 2，停止列表为 `[]`。 | 启动返回后只判断当前记录是否取消或终态，未判断它已被新 attempt 替代。 |
| 新心跳仍被过期恢复停机 | 查询过期执行的状态期间，先提交新心跳，再返回 `running`。旧执行被停止一次，attempt 保持 1，没有启动替代执行。 | 恢复代码先停止旧执行，随后才用原子状态检查发现心跳已更新并放弃恢复。 |
| 不同项目并发超出活动上限 | `maxActive=1`，并发提交两个不同项目，两个提交均成功并启动两个执行。 | 准入检查在任务创建之前读取数量，多个调用可以共用同一个旧数量。 |

最初的隔离脚本结果为 0 通过、4 失败。将对应行为加入正式回归、尚未修改生产代码时，`server/cloud-production.test.mjs` 结果为 **20 通过、4 失败**，失败断言如下：

```text
incremental polling retains another task terminal update at the same millisecond
  terminal state must arrive without a fresh after=0 request
  actual false / expected true

immediate remake after cancellation stops the old attempt when its startup returns late
  actual [] / expected [{ name: 'old-late-vm' }]

fresh heartbeat during reconciliation prevents stopping a healthy execution
  actual stopped executions 1 / expected 0

different concurrent submissions atomically respect the active-task admission limit
  actual accepted submissions 2 / expected 1
```

完整修复前输出保存在 `/private/tmp/gomotion-async-resume-audit-2026-11-13/formal-red.log`；上述失败原因在本报告中保留。

## 修改

生产变更仅位于 [云端任务管理器](/Users/chenzhijiang/Documents/Codex/2026-11-09/gomotion-market-research/outputs/gomotion-mvp/server/cloud/productions.mjs:43)，正式回归位于 [cloud-production.test.mjs](/Users/chenzhijiang/Documents/Codex/2026-11-09/gomotion-market-research/outputs/gomotion-mvp/server/cloud-production.test.mjs:149)。

- 轮询返回当前用户的完整任务快照。原实现已经读取这些记录，因此没有增加此查询的存储读取次数。前端继续按每个任务的版本去重。代价是响应数据量增加；后续若需要真正增量传输，应引入全局变化序号或每任务游标。
- 晚返回的执行会核对 attempt，旧 attempt 的执行会被停止，当前重做任务保持原执行。
- 恢复先通过原子条件写取得恢复权，再停止旧执行。查询执行状态时收到的新心跳可以使恢复失效。
- 最大活动量的最终检查放入现有索引的条件写事务中，不增加全局执行锁。只计算已取得准入的活动任务，避免两个未获准的旧草稿互相占位。
- 新 attempt 标记准入待完成；轮询不能绕过准入抢先启动。准入失败的未启动任务转为可重试草稿；已持久保存准入但请求中断时，刷新会在同一 attempt 完成准入并继续。

权限校验、显式停止、旧 worker 凭据隔离、检查点保留、错误脱敏和原有上限继续保留。

## 新增保护覆盖

在最初四项之外，新增四项离线保护：

| 场景 | 核对结果 |
| --- | --- |
| 已有项目重试与轮询相遇，但每日名额已满 | 返回 429，不新增执行，之后刷新也不会绕过准入。该时序修复前实际启动了第二个执行。 |
| 索引已保存准入、清理待完成标记前请求中断 | 新管理器读取后继续同一任务与同一 attempt，只启动一次。 |
| 实际 `createBlobStore` 遇到索引条件写竞争 | 确实产生并重试条件写冲突；上限为 1 时，三个不同提交仅一个取得名额与执行。SDK 的存储传输使用内存适配器，没有联系 Blob。 |
| 两个已在索引中的失败草稿并发重试 | 空位为 1 时恰好一个成功，另一个收到 409，未获准草稿不会互相阻塞。 |

## 最终检查

从应用目录执行：

```sh
node --test src/hooks/useProductionTasks.test.mjs server/productions.test.mjs server/cloud-production.test.mjs
git diff --check -- server/cloud/productions.mjs server/cloud-production.test.mjs
```

最终结果：**44 tests，44 pass，0 fail，0 cancelled，0 skipped**，相关差异格式检查通过。完整输出保存在 `/private/tmp/gomotion-async-resume-audit-2026-11-13/final-related.log`。其中包括既有的前端卸载只取消 GET、刷新读取同一任务、提交后离页不发送 DELETE、只有主动停止发送 DELETE、旧版本不能覆盖新任务，以及本地持久化和云端检查点恢复检查。

根代理另行负责全量回归、类型检查和构建，本报告不预先宣称这些项目通过。本轮没有启动、停止或重启服务，没有读取或修改用户工作数据，没有新增真实任务、停止用户任务或部署代码。

## 仍需真实界面验收

`src/App.tsx` 的前端订阅在应用层保持运行，页面导航本身没有调用取消；视图由同标签的 `sessionStorage` 恢复，项目由 `localStorage` 保存。既有 hook 检查已经覆盖接口与卸载边界，但不能替代真实活动任务的浏览器操作。

仍需在获授权的真实制作任务中核对：离开制作页后同一任务继续、刷新后仍恢复当前项目和任务、返回 Projects 后进度更新、完成不抢走当前页面，以及仅主动停止使对应任务终止。本轮的固定响应和内存执行器不能计为这部分验收完成。


## 独立复核补充：恢复中断窗口

复核发现：原修复在先提交 attempt++、删除旧执行引用后，若请求消失在停止旧实例之前，后续请求会找不到旧实例并另启一个实例。已在正式[云任务回归](gomotion-mvp/server/cloud-production.test.mjs)先新增两项失败复现，[红灯记录](cloud-recovery-interruption-red-2026-11-13.txt)，然后实现持久的待停止引用；确认停止后才移除并启动替代实例。停止暂时失败时保留引用等待后续请求。另覆盖已经删除的执行实例重复停止，[红灯记录](cloud-idempotent-stop-red-2026-11-13.txt)，生产执行器404停止幂等。

包含模型角色切换、缓存及此修复的[最终全量回归](deepseek-full-regression-2026-11-13.txt)为369/369、无跳过。该结果替代本报告早期44项检查的最新范围；没有把中止的复核代理描述为仍运行。当前没有真实活动任务的离页/刷新/主动停止验收；本地服务重载前后原4条终态与存档SHA相同，[本地核对](deepseek-local-activation-2026-11-13.json)。
