# @acontext/acontext 0.1.1 - Sandbox & Skill 功能清单

## 📦 版本信息
- **版本**: 0.1.1
- **主要变更**: `zod` 依赖从 `^4.1.12` 升级到 `^4.3.5`

---

## 🔧 SandboxesAPI 方法

Sandbox API 提供安全的隔离环境来执行 shell 命令。每个 sandbox 是一个临时容器，独立运行。

### 可用方法：

1. **`create()`** - 创建并启动一个新的 sandbox
2. **`execCommand()`** - 在指定的 sandbox 中执行 shell 命令
3. **`kill()`** - 终止一个正在运行的 sandbox
4. **`getLogs()`** - 获取 sandbox 的日志

---

## 📚 SkillsAPI 方法

Skills API 用于管理 Agent Skills（技能包），这些是包含指令、脚本和资源的文件夹，帮助 Agent 更准确地执行任务。

### 可用方法：

1. **`create()`** - 创建一个新的 skill
2. **`listCatalog()`** - 列出可用的技能目录
3. **`get()`** - 根据 ID 或名称获取 skill 信息
4. **`delete()`** - 删除一个 skill
5. **`getFile()`** - 获取 skill 中的特定文件
6. **`downloadToSandbox()`** - 将 skill 的所有文件下载到 sandbox 环境（文件会放在 `/skills/{skill_name}/`）

---

## 🛠️ Sandbox Tools（沙箱工具）

这些工具允许 LLM 通过函数调用在安全的沙箱环境中执行代码和管理文件。

### 1. **bash_execution_sandbox** (BashTool)
执行 bash 脚本的安全沙箱工具。

**参数：**
- `command` (string, required) - 要执行的 bash 命令
  - 示例：`'ls -la'`, `'python3 script.py'`, `'sed -i 's/old_string/new_string/g' file.py'`
- `timeout` (number | null, optional) - 命令的超时时间（秒），用于可能超过默认超时的长时间运行命令

**功能：**
- 文件系统操作（移动、复制、重命名、组织文件）
- 使用标准 Unix 工具进行文本处理和操作
- 执行脚本和程序

---

### 2. **text_editor_sandbox** (TextEditorTool)
在沙箱中查看、创建和编辑文本文件的工具。

**参数：**
- `command` (enum, required) - 要执行的操作：
  - `"view"` - 查看文件
  - `"create"` - 创建文件
  - `"str_replace"` - 字符串替换
- `path` (string, required) - 沙箱中的文件路径（例如：`'/workspace/script.py'`）
- `file_text` (string | null, optional) - 用于 `create` 命令：要写入文件的内容
- `old_str` (string | null, optional) - 用于 `str_replace` 命令：要查找和替换的确切字符串
- `new_str` (string | null, optional) - 用于 `str_replace` 命令：替换 `old_str` 的字符串
- `view_range` (array | null, optional) - 用于 `view` 命令：可选的 `[start_line, end_line]` 来查看特定行

**功能：**
- 所有文件操作都在沙箱容器环境中进行
- 支持查看、创建和修改文本文件

---

### 3. **export_file_sandbox** (ExportSandboxFileTool)
将文件从 sandbox 导出到持久化的共享磁盘存储，并返回公共下载 URL。

**参数：**
- `sandbox_path` (string, required) - 文件在 sandbox 中的目录路径，必须以 `/` 结尾
  - 示例：`'/workspace/'`, `'/home/user/output/'`
- `sandbox_filename` (string, required) - 要从 sandbox 导出的文件名

**功能：**
- 将沙箱文件导出到磁盘存储
- 返回公共下载 URL
- 如果 sandbox 文件更改，磁盘文件不会自动更新，需要重新导出

---

## 📖 Skill Tools（技能工具）

这些工具允许 LLM 通过函数调用访问可重用的知识包（skills）。

### 1. **get_skill** (GetSkillTool)
根据名称获取 skill。返回 skill 信息，包括文件的相对路径和 MIME 类型类别。

**参数：**
- `skill_name` (string, required) - skill 的名称

**返回：**
- Skill 信息，包括文件列表和 MIME 类型

---

### 2. **get_skill_file** (GetSkillFileTool)
从 skill 中获取特定文件。

**参数：**
- `skill_name` (string, required) - skill 的名称
- `file_path` (string, required) - skill 内的相对路径（例如：`'scripts/extract_text.json'`）
  - **提示**：`SKILL.md` 是您应该首先阅读的文件，以了解该 skill 的完整内容
- `expire` (integer | null, optional) - URL 过期时间（秒），仅用于不可解析的文件。默认为 900（15 分钟）

**功能：**
- 读取 skill 中的文件内容
- 支持文本文件和二进制文件（返回下载 URL）

---

## 🔗 Skill Context Helper Functions（技能上下文辅助函数）

这些函数帮助管理技能上下文：

1. **`createSkillContext()`** - 创建技能上下文
2. **`getSkillFromContext()`** - 从上下文中获取技能
3. **`listSkillNamesFromContext()`** - 列出上下文中的技能名称

---

## 📝 Reminders（提示信息）

包提供了几个提示信息，用于指导 LLM 正确使用这些工具：

### SKILL_REMINDER
强制性的技能阅读和执行协议：
- 在使用任何代码或执行工具之前，必须完成所有步骤
- 第一步：识别所有相关技能
- 扫描用户消息...

### SANDBOX_BASH_REMINDER
何时直接使用 `bash_execution_sandbox` 工具：
- 需要 shell 命令的文件系统操作
- 使用标准工具进行文本处理和操作...

### SANDBOX_TEXT_EDITOR_REMINDER
`text_editor_sandbox` 工具说明：
- 在安全的沙箱容器环境中查看、创建和修改文本文件
- 所有文件操作都在沙箱容器环境中进行...

---

## 🎯 使用场景

### Sandbox 使用场景：
1. **代码执行** - 运行 Python、Node.js、Shell 脚本等
2. **文件操作** - 创建、编辑、删除文件
3. **数据处理** - 处理和分析数据文件
4. **测试和调试** - 在隔离环境中测试代码

### Skill 使用场景：
1. **技能发现** - 查找可用的技能包
2. **技能读取** - 读取技能中的文档和脚本
3. **技能执行** - 将技能下载到 sandbox 并执行其中的脚本
4. **轻量级访问** - 对于只包含领域特定上下文的技能（不需要运行代码），可以直接使用 Skill Content Tools，无需创建 sandbox

---

## 💡 最佳实践

1. **技能优先** - 在使用执行工具之前，先识别并阅读相关技能
2. **Sandbox 生命周期** - 创建 sandbox → 执行操作 → 导出结果 → 终止 sandbox
3. **文件导出** - 重要文件记得使用 `export_file_sandbox` 导出到持久化存储
4. **技能挂载** - 可以在创建 sandbox 时挂载技能，技能文件会下载到 `/skills/{skill_name}/`

---

## 📚 相关文档

- [Acontext Sandbox API 文档](https://docs.acontext.io/store/sandbox)
- [Acontext Skills API 文档](https://docs.acontext.io/store/skill)
- [Sandbox Tools 文档](https://docs.acontext.io/tool/bash_tools)
- [Skill Content Tools 文档](https://docs.acontext.io/tool/skill_tools)
- [使用 Agent Skills 指南](https://docs.acontext.io/engineering/agent_skills)

