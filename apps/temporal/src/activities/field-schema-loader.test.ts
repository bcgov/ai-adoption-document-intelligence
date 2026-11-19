import { getPrismaClient } from "./database-client";
import { loadFieldMapFromProject } from "./field-schema-loader";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

interface TemplateRow {
  id: string;
  group_id: string;
  field_schema: Array<{
    field_key: string;
    field_type: string;
    field_format: string | null;
    format_spec: string | null;
  }>;
}

function templateTable(rows: TemplateRow[]) {
  return {
    templateModel: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          rows.find((r) => r.id === where.id) ?? null,
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; group_id?: string } }) =>
          rows.find(
            (r) =>
              r.id === where.id &&
              (where.group_id === undefined || r.group_id === where.group_id),
          ) ?? null,
      ),
    },
  };
}

function amountTemplate(groupId: string): TemplateRow {
  return {
    id: "tm-1",
    group_id: groupId,
    field_schema: [
      {
        field_key: "amount",
        field_type: "number",
        field_format: null,
        format_spec: null,
      },
    ],
  };
}

describe("loadFieldMapFromProject", () => {
  afterEach(() => {
    getPrismaClientMock.mockReset();
  });

  it("loads the field schema of a template model in the given group", async () => {
    const prisma = templateTable([amountTemplate(GROUP)]);
    getPrismaClientMock.mockReturnValue(prisma);

    const fieldMap = await loadFieldMapFromProject("tm-1", GROUP);

    expect(fieldMap).toEqual({
      amount: expect.objectContaining({ type: "number" }),
    });
    expect(prisma.templateModel.findFirst).toHaveBeenCalledWith({
      where: { id: "tm-1", group_id: GROUP },
      include: { field_schema: { orderBy: { display_order: "asc" } } },
    });
  });

  it("treats a template model from another group as not found", async () => {
    getPrismaClientMock.mockReturnValue(
      templateTable([amountTemplate(OTHER_GROUP)]),
    );

    await expect(loadFieldMapFromProject("tm-1", GROUP)).resolves.toBeNull();
  });
});
