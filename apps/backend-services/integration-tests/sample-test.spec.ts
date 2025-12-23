import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/client";

const POSTGRES_USER = "testuser";
const POSTGRES_PASSWORD = "testpass";
const POSTGRES_DB = "testdb";
const PORT = 5555;

const DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${PORT}/${POSTGRES_DB}?schema=public`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

describe("test", () => {
  beforeAll(async () => {
    // Insert dummy document
    await prisma.document.create({
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
    // Clean up
    await prisma.document.deleteMany({ where: { source: "integration-test" } });
    await prisma.$disconnect();
  });

  it("tests", async () => {
    const doc = await prisma.document.findFirst({
      where: { source: "integration-test" },
    });
    expect(doc).toBeTruthy();
    expect(doc?.title).toBe("Test Document");
  });
});
