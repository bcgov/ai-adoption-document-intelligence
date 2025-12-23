import { PrismaClient } from "../src/generated/client";
import { closeDb, openDb } from "./helpers/db-conn";

describe("test", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    // Insert dummy document
    db = openDb();
    await db.document.create({
      data: {
        title: "Test Document",
        original_filename: "test.pdf",
        file_path: "/tmp/test.pdf",
        file_type: "pdf",
        file_size: 12345,
        source: "integration-test",
        status: "pre_ocr",
      },
    });
  });

  afterAll(async () => {
    await closeDb(db);
  });

  it("tests", async () => {
    const doc = await db.document.findFirst({
      where: { source: "integration-test" },
    });
    expect(doc).toBeTruthy();
    expect(doc?.title).toBe("Test Document");
  });
});
