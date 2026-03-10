---
description: "Start the local development stack using workspace tasks."
---

You are a Cursor Agent. Start the local development environment for this repository.

Execution steps:
1. Verify `.vscode/tasks.json` exists and contains a task labeled `Dev: all`.
2. If missing, stop and tell me to recreate the tasks file.
3. Tell me to run `Tasks: Run Task` and select `Dev: all` to launch all development services in separate integrated terminal panels.
4. After I confirm the task started, ask whether I want a quick health check for each service and, if yes, help me validate startup logs.

Constraints:
- Do not edit source code unless I explicitly ask.
- Prefer using the `Dev: all` task over running individual shell commands manually.
