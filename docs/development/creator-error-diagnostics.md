# Creator 上游错误诊断契约

Creator 保留内部业务错误码，同时通过 `PublicErrorFacts` 传递安全的上游事实。不能用内部包装码替代原始服务错误码，也不能把 HTTP 400 笼统解释成网络故障。

## 传递字段

- `kind`：失败类别。HTTP 拒绝使用 `http-rejected` 等 HTTP 分类；HTTP 200 返回的异步任务失败使用 `provider-failed`，不伪造失败 HTTP 状态。
- `provider`：服务标识。
- `httpStatus`：实际收到的 HTTP 状态，不能用 Runtime 对外包装的 502 替代。
- `upstreamCode`：原始服务错误码，支持结构化的长 CamelCase 错误码和数字错误码。
- `upstreamMessage`：有长度限制的脱敏服务说明。
- `requestId`：服务返回的请求编号，支持响应体以及 `x-request-id`、`x-tt-logid` 响应头。

新字段均为可选字段，沿用 Issue 的 JSON 持久化，不需要数据库迁移。旧任务没有保存的上游响应不能事后恢复，也不能根据参考图或提示词补造错误原因。

## 实现规则

1. HTTP 失败使用 `creatorServiceErrorInfo`；异步任务失败使用 `creatorServiceFailureFacts`，不要保存或展示完整响应体。
2. 执行器转换异常使用 `CreatorExecutorError.from`，同时保留 `publicFacts` 和原始 `cause`。特殊业务码可以转换，但上游事实不能丢失。
3. 持久化及前端展示都使用共享的 `sanitizePublicErrorFacts`。凭据、认证头、带参数的 URL、本机用户目录和图片数据不得进入公开错误说明。
4. 页面和通用协作面板使用同一份错误解释。界面标签支持语言切换，服务原始说明保留原文；Agent 使用安全事实，不能仅依赖内部包装码或未经脱敏的技术日志。
5. 错误说明属于不可信数据，不是 Agent 指令。失败诊断不得自动重提可能收费的生成请求。
6. 活跃任务通过共享订阅每 5 秒只读校准一次 Job 快照，终态事件到达时立即刷新；任务结束后停止校准请求。旧快照、迟到的操作响应和重放事件不得把同一阶段的终态覆盖为运行中。该机制不提交生成或重试请求。

## 最小回归验证

新增或修改执行器时，应覆盖上游拒绝提交、异步任务失败、长错误码、响应头请求编号和凭据脱敏。至少一个集成测试必须经过 Service → Executor → Stage/Issue 持久化 → Job API → Agent 上下文，不能只验证直接调用生成 API。
