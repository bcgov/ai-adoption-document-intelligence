import * as fs from "fs";
import * as path from "path";
import TestAgent from "supertest/lib/agent";
import { PrismaClient } from "../src/generated/client";
import { QueueService } from "../src/queue/queue.service";
import { closeDb, openDb } from "./helpers/db-conn";
import { CompositeMockGuard } from "./helpers/test-app.module";
import setupTestModule from "./helpers/test-app-setup";

const testModule = setupTestModule();
let agent: TestAgent;

describe("/upload endpoints", () => {
  beforeAll(async () => {
    agent = await testModule.open();
  });

  afterAll(async () => {
    await testModule.close();
  });

  describe("POST /api/upload", () => {
    let db: PrismaClient;

    beforeAll(() => {
      db = openDb();
      // Replace processOcrForDocument with a resolved promise
      // This is needed because of the un-awaited promise upload controller
      // Perhaps we should rethink this flow
      QueueService.prototype.processOcrForDocument = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    afterEach(async () => {
      await db.document.deleteMany();
      await db.ocrResult.deleteMany();
    });

    afterAll(async () => {
      await closeDb(db);
    });

    it("should upload a document and return metadata", async () => {
      CompositeMockGuard.mockUser = {
        idir_username: "uploaduser",
        display_name: "Upload User",
        email: "upload@example.com",
        roles: ["user"],
      };
      const testPdf = Buffer.from("Dummy PDF content").toString("base64");
      const payload = {
        title: "Upload Test Document",
        file: testPdf,
        file_type: "pdf",
        original_filename: "upload-test.pdf",
        metadata: { foo: "bar" },
      };
      const res = await agent
        .post("/api/upload")
        .set("Content-Type", "application/json")
        .send(payload)
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.document).toMatchObject({
        title: payload.title,
        original_filename: payload.original_filename,
        file_type: payload.file_type,
        status: expect.any(String),
      });
      // Check DB
      const doc = await db.document.findFirst({
        where: { title: payload.title },
      });
      expect(doc).toBeTruthy();
      expect(doc?.original_filename).toBe(payload.original_filename);
      // Check file exists
      const filePath = path.join(__dirname, "../", doc!.file_path);
      expect(fs.existsSync(filePath)).toBe(true);
      // Clean up file
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Adjust time as needed
    });

    it("should return 400 if file data is missing", async () => {
      const payload = {
        title: "No File Document",
        file: "",
        file_type: "pdf",
        original_filename: "nofile.pdf",
        metadata: {},
      };
      const res = await agent.post("/api/upload").send(payload).expect(400);
      expect(res.body.message).toMatch(/file data is required/i);
    });
  });
});
