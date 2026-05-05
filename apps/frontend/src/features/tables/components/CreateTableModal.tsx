import { Button, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";
import type { TableDetail } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  onCreated: (tableId: string) => void;
}

export function CreateTableModal({ opened, onClose, onCreated }: Props) {
  const { activeGroup } = useGroup();
  const qc = useQueryClient();
  const form = useForm({
    initialValues: { table_id: "", label: "", description: "" },
    validate: {
      table_id: (v) =>
        /^[a-z][a-z0-9_]*$/.test(v)
          ? null
          : "Lowercase letters, digits, underscore. Must start with a letter.",
      label: (v) => (v.trim() ? null : "Required"),
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: typeof form.values): Promise<TableDetail> => {
      if (!activeGroup) throw new Error("No active group");
      const response = await apiService.post<TableDetail>("/tables", {
        ...values,
        group_id: activeGroup.id,
        description: values.description.trim() || null,
      });
      if (!response.success)
        throw new Error(response.message ?? "Failed to create table");
      return response.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tables", activeGroup?.id] });
      onClose();
      form.reset();
      onCreated(data.table_id);
    },
  });

  const handleClose = () => {
    form.reset();
    mutation.reset();
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Create Table">
      <form onSubmit={form.onSubmit((v) => mutation.mutate(v))}>
        <Stack>
          <TextInput
            label="Table ID"
            description="Stable identifier — lowercase, no spaces (e.g. payment_schedule)"
            required
            {...form.getInputProps("table_id")}
          />
          <TextInput
            label="Label"
            description="Display name shown in lists"
            required
            {...form.getInputProps("label")}
          />
          <Textarea
            label="Description"
            description="Optional"
            {...form.getInputProps("description")}
          />
          {mutation.isError && (
            <div
              style={{
                color: "var(--mantine-color-red-6)",
                fontSize: "0.875rem",
              }}
            >
              {(mutation.error as Error).message}
            </div>
          )}
          <Button type="submit" loading={mutation.isPending}>
            Create
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
