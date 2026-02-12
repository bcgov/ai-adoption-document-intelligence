import { WorkflowEditorPage } from "./WorkflowEditorPage";

interface WorkflowEditPageProps {
  workflowId: string;
  onBack?: () => void;
  onSave?: () => void;
}

export function WorkflowEditPage({
  workflowId,
  onBack,
  onSave,
}: WorkflowEditPageProps) {
  return (
    <WorkflowEditorPage
      mode="edit"
      workflowId={workflowId}
      onBack={onBack}
      onSave={onSave}
    />
  );
}
