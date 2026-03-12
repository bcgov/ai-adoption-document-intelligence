# useCreateWorkflow – Active Group Injection

The `useCreateWorkflow` hook automatically scopes new workflow creation requests to the user's currently active group. Callers do not need to supply a `groupId`; it is read from `GroupContext` and injected into the API request internally.

## Location

`apps/frontend/src/data/hooks/useWorkflows.ts`

## Behaviour

1. On invocation, the hook reads `activeGroup` from `GroupContext` via `useGroup()`.
2. When `mutateAsync` (or `mutate`) is called:
   - If `activeGroup` is `null`, an error is thrown immediately and the API is **not** called.
   - If `activeGroup` is set, its `id` is merged into the request payload as `groupId` before the `POST /workflows` call is made.

## Interface

### `CreateWorkflowDto` (caller-facing)

Callers provide only workflow content — `groupId` must **not** be passed.

```ts
interface CreateWorkflowDto {
  name: string;
  description?: string;
  config: GraphWorkflowConfig;
}
```

The `groupId` is appended internally by the hook.

## Usage

```tsx
import { useCreateWorkflow } from "../data/hooks/useWorkflows";

function MyComponent() {
  const createWorkflow = useCreateWorkflow();

  const handleCreate = async () => {
    // groupId is injected automatically from the active group in GroupContext
    await createWorkflow.mutateAsync({
      name: "My Workflow",
      config: { /* GraphWorkflowConfig */ },
    });
  };
}
```

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| `activeGroup` is `null` | Throws `"No active group selected"` before any network call |
| API returns a failure response | Throws the `message` from the response, or a fallback string |
