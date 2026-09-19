# PR 功能评审清单

按 PR 实际风险选择相关部分，不要求每项机械展开。

## 功能与数据

- 用户入口、输入、输出和成功路径是否完整。
- 空值、上限、非法格式、重复提交、取消、失败和重试是否得到正确结果。
- 是否会丢失或覆盖已有数据；历史版本、stale 状态和依赖传播是否一致。
- 文件是否进入受管理目录，路径、大小、编码和下载权限是否受控。

## 架构边界

- Creator 模板复用唯一 `CreatorCollaborationPanel`；差异通过 Adapter、配置或局部 slot 表达。
- 通用 Panel 不读取执行器私有字段；Runtime 进度使用统一字段。
- UI-only 状态不写入用户可见 Activity。
- 通用业务由 Web 与 Daemon 共用；Desktop 差异通过真实 capability 表达。
- Browser 不显示无效原生入口，Desktop 入口真实调用 Bridge。

## 协议、凭据和运行时

- 协议生产者与所有消费者同步更新，兼容旧持久化数据。
- 凭据不进入日志、可见配置或仓库；环境变量来源和优先级明确。
- Provider 请求的认证、超时、取消、响应大小、错误帧和重试语义正确。
- Mock 测试不能替代关键第三方协议的真实 smoke evidence。

## 测试证据

- 单元测试覆盖关键分支而非只验证组件出现。
- 共享状态和持久化有 integration test。
- Creator 新模板包含 Adapter、Activity 过滤去重、Stage 和真实进度测试。
- Web/Desktop 相关改动包含相同 Fake Daemon、视口、Runtime 调用和持久化结果 parity。
- CI 必须对应当前 head SHA；旧 run 不能证明更新后的分支。

## 英文反馈模板

```markdown
Thanks for the contribution. I reviewed the feature behavior,
implementation boundaries, and validation evidence.

## Blocking issues

### 1. <Concise problem>

<What the code currently does, with a file or behavior reference.>

Impact:
<The observable failure, data risk, security issue, or violated contract.>

Required change:
<The concrete behavior or verification needed before merging.>

## Verification required

- <Targeted test or scenario>
- <Relevant parity, runtime, or provider evidence>
```

无阻断问题时可使用：

```markdown
The feature behavior and implementation boundaries look correct.
The targeted tests and required parity checks pass. Approved for
merging into develop.
```

只反馈有证据的问题。把偏好型建议标为 non-blocking，不用 request changes 阻止合并。
