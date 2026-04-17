import * as fs from "fs";
import * as path from "path";
import TestAgent from "supertest/lib/agent";
import { DocumentStatus, PrismaClient } from "../src/generated/client";
import { closeDb, openDb } from "./helpers/db-conn";
import setupTestModule from "./helpers/test-app-setup";

const testModule = setupTestModule();
let agent: TestAgent;

describe("/document endpoints", () => {
  beforeAll(async () => {
    agent = await testModule.open();
  });

  afterAll(async () => {
    await testModule.close();
  });

  describe("GET /api/documents", () => {
    let db: PrismaClient;
    beforeAll(() => {
      db = openDb();
    });

    afterEach(async () => {
      await db.document.deleteMany();
      await db.ocrResult.deleteMany();
    });

    afterAll(async () => {
      await closeDb(db);
    });

    it("should return an empty array if there are no documents", async () => {
      const res = await agent.get("/api/documents").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it("should return an array of documents in the database", async () => {
      // First make sure there's a document there
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
      // Then retrieve it
      const res = await agent.get("/api/documents").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body.at(0)["title"]).toBe("Test Document");
    });
  });

  describe("GET /api/documents/:documentId/ocr", () => {
    let db: PrismaClient;
    let documentId;
    beforeAll(() => {
      db = openDb();
    });
    afterEach(async () => {
      await db.document.deleteMany();
      await db.ocrResult.deleteMany();
    });
    afterAll(async () => {
      await closeDb(db);
    });
    it("should return OCR result for an existing document with OCR", async () => {
      // Create a document
      const doc = await db.document.create({
        data: {
          title: "OCR Test Document",
          original_filename: "ocr.pdf",
          file_path: "/tmp/ocr.pdf",
          file_type: "pdf",
          file_size: 12345,
          source: "integration-test",
          status: DocumentStatus.completed_ocr,
        },
      });
      documentId = doc.id;
      // Create an OCR result for the document
      const ocrResult = await db.ocrResult.create({
        data: {
          document_id: documentId,
          keyValuePairs: {
            field1: { type: "string", content: "value1", confidence: 0.95 },
          },
        },
      });
      // Test the endpoint
      const res = await agent
        .get(`/api/documents/${documentId}/ocr`)
        .expect(200);
      expect(res.body).toHaveProperty("ocr_result");
      const return_ocr_result = res.body.ocr_result;
      expect(return_ocr_result).toHaveProperty("keyValuePairs");
      expect(return_ocr_result.keyValuePairs).toEqual(ocrResult.keyValuePairs);
      expect(return_ocr_result).toHaveProperty("processed_at");
      expect(return_ocr_result).toHaveProperty("document_id", documentId);
    });

    it("should return 200 with null result if document exists but no OCR result", async () => {
      // Create a document without OCR result
      const doc = await db.document.create({
        data: {
          title: "No OCR Document",
          original_filename: "noocr.pdf",
          file_path: "/tmp/noocr.pdf",
          file_type: "pdf",
          file_size: 12345,
          source: "integration-test",
          status: "pre_ocr",
        },
      });
      documentId = doc.id;
      // Test the endpoint
      const res = await agent
        .get(`/api/documents/${documentId}/ocr`)
        .expect(200);
      const returnedDoc = res.body;
      expect(returnedDoc.title).toEqual("No OCR Document");
      expect(returnedDoc.ocr_result).toBeNull();
    });

    it("should return 404 for missing document", async () => {
      const res = await agent.get("/api/documents/999999/ocr").expect(404);
      expect(res.body.message).toMatch(/not found/i);
    });
  });

  describe("GET /api/documents/:documentId/download", () => {
    let db: PrismaClient;
    let documentId;
    const storageDir = path.join(__dirname, "../storage/documents");
    const testFilePath = path.join(storageDir, "test-download.pdf");
    const testFileContent = Buffer.from("This is a test PDF file.");

    beforeAll(() => {
      db = openDb();
      // Ensure storage directory exists
      if (!fs.existsSync(storageDir))
        fs.mkdirSync(storageDir, { recursive: true });
      // Write a test file to disk
      fs.writeFileSync(testFilePath, testFileContent);
    });

    afterEach(async () => {
      await db.document.deleteMany();
      await db.ocrResult.deleteMany();
    });

    afterAll(async () => {
      await closeDb(db);
      // Remove the test file
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    });

    it("should return the file for an existing document", async () => {
      // Create a document
      const doc = await db.document.create({
        data: {
          title: "Download Test Document",
          original_filename: "test-download.pdf",
          file_path: `storage/documents/test-download.pdf`,
          file_type: "pdf",
          file_size: testFileContent.length,
          source: "integration-test",
          status: "pre_ocr",
        },
      });
      documentId = doc.id;
      // Test the endpoint
      const res = await agent
        .get(`/api/documents/${documentId}/download`)
        .expect(200);
      expect(res.header["content-type"]).toBe("application/pdf");
      expect(res.header["content-disposition"]).toMatch(
        /inline; filename="test-download.pdf"/,
      );
      expect(res.body).toBeInstanceOf(Buffer);
      expect(Buffer.compare(res.body, testFileContent)).toBe(0);
    });

    it("should return 404 for missing document", async () => {
      const res = await agent.get("/api/documents/999999/download").expect(404);
      expect(res.body.message).toMatch(/not found/i);
    });
  });
});
