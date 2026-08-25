/**
 * SaveAsLibraryModal — declare-and-save modal for the "Save as library"
 * top-bar action (US-059 → US-061).
 *
 * Captures the library workflow's name + description + declared
 * `inputs[]` / `outputs[]`. On submit, calls `onSubmit` with the
 * declared signature; the host page is responsible for stamping it
 * onto the current `GraphWorkflowConfig.metadata` and POSTing a new
 * workflow record (with `kind: "library"`).
 *
 * Always creates a new workflow record (D2 in REQUIREMENTS.md);
 * never mutates the in-flight workflow.
 */

import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useEffect, useState } from "react";
import type { LibraryPortDescriptor } from "../../../types/workflow";
import { LibraryPortListEditor } from "./LibraryPortListEditor";

export interface SaveAsLibrarySubmission {
  name: string;
  description: string;
  inputs: LibraryPortDescriptor[];
  outputs: LibraryPortDescriptor[];
}

export interface SaveAsLibraryModalProps {
  opened: boolean;
  onClose: () => void;
  /** Initial name (typically prefilled from the editor's name field). */
  initialName: string;
  /** Initial description (typically prefilled from the editor). */
  initialDescription: string;
  /** Loading flag — disables Save while POSTing. */
  isSaving: boolean;
  onSubmit: (submission: SaveAsLibrarySubmission) => void | Promise<void>;
}

function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

function rowsValid(rows: LibraryPortDescriptor[]): boolean {
  return rows.every((row) => !isBlank(row.label) && !isBlank(row.path));
}

export function SaveAsLibraryModal({
  opened,
  onClose,
  initialName,
  initialDescription,
  isSaving,
  onSubmit,
}: SaveAsLibraryModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [inputs, setInputs] = useState<LibraryPortDescriptor[]>([]);
  const [outputs, setOutputs] = useState<LibraryPortDescriptor[]>([]);
  const [submitted, setSubmitted] = useState(false);

  // Reset state to match initial props each time the modal opens.
  useEffect(() => {
    if (opened) {
      setName(initialName);
      setDescription(initialDescription);
      setInputs([]);
      setOutputs([]);
      setSubmitted(false);
    }
  }, [opened, initialName, initialDescription]);

  const nameError = submitted && isBlank(name) ? "Name is required" : null;
  const inputsError =
    submitted && !rowsValid(inputs)
      ? "All input rows need a non-empty label and path"
      : null;
  const outputsError =
    submitted && !rowsValid(outputs)
      ? "All output rows need a non-empty label and path"
      : null;

  const canSubmit =
    !isBlank(name) && rowsValid(inputs) && rowsValid(outputs) && !isSaving;

  const handleSave = async () => {
    setSubmitted(true);
    if (isBlank(name) || !rowsValid(inputs) || !rowsValid(outputs)) {
      return;
    }
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      inputs,
      outputs,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Save as library workflow"
      size="lg"
      centered
      data-testid="save-as-library-modal"
    >
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          A library workflow is a reusable building-block. Declare its inputs
          and outputs here — those become the signature seen by `childWorkflow`
          nodes that reference this library. Saving creates a new workflow
          record; the current workflow is not modified.
        </Text>
        <TextInput
          label="Name"
          required
          size="sm"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          error={nameError}
          data-testid="save-as-library-name"
        />
        <Textarea
          label="Description"
          size="sm"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          autosize
          minRows={2}
          data-testid="save-as-library-description"
        />
        <LibraryPortListEditor
          title="Inputs"
          description="Each row defines an input port: a label, the ctx/path the value populates, and its type."
          testIdBase="save-as-library-inputs"
          rows={inputs}
          onChange={setInputs}
        />
        {inputsError && (
          <Text size="xs" c="red">
            {inputsError}
          </Text>
        )}
        <LibraryPortListEditor
          title="Outputs"
          description="Each row defines an output port: a label, the source path the value reads from, and its type."
          testIdBase="save-as-library-outputs"
          rows={outputs}
          onChange={setOutputs}
        />
        {outputsError && (
          <Text size="xs" c="red">
            {outputsError}
          </Text>
        )}
        <Group justify="flex-end" gap="xs">
          <Button
            variant="default"
            size="xs"
            onClick={onClose}
            disabled={isSaving}
            data-testid="save-as-library-cancel"
          >
            Cancel
          </Button>
          <Button
            size="xs"
            onClick={handleSave}
            loading={isSaving}
            disabled={!canSubmit && submitted}
            data-testid="save-as-library-submit"
          >
            Save library
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
