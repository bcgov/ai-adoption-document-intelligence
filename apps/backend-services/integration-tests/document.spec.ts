import TestAgent from "supertest/lib/agent";
import { DocumentStatus, PrismaClient } from "../src/generated/client";
import { closeDb, openDb } from "./helpers/db-conn";
import { CompositeMockGuard } from "./helpers/test-app.module";
import setupTestModule from "./helpers/test-app-setup";

const testModule = setupTestModule();
let agent: TestAgent;

beforeAll(async () => {
  agent = await testModule.open();
});

afterAll(async () => {
  await testModule.close();
});

describe("GET /api/protected", () => {
  it("should return protected data and user info", async () => {
    CompositeMockGuard.mockUser = {
      idir_username: "testuser",
      display_name: "Test User",
      email: "test@example.com",
      roles: ["user", "admin"],
    };
    const res = await agent.get("/api/protected").expect(200);
    expect(res.body).toHaveProperty("message", "Protected data");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toMatchObject({
      idirUsername: "testuser",
      displayName: "Test User",
      email: "test@example.com",
    });
  });
});

describe("GET /api/admin", () => {
  it("should return admin data and user info with roles", async () => {
    CompositeMockGuard.mockUser = {
      idir_username: "adminuser",
      display_name: "Admin User",
      email: "admin@example.com",
      roles: ["admin"],
    };
    const res = await agent.get("/api/admin").expect(200);
    expect(res.body).toHaveProperty("message", "Admin only data");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toMatchObject({
      idirUsername: "adminuser",
      displayName: "Admin User",
      email: "admin@example.com",
      roles: ["admin"],
    });
  });
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

describe("GET /api/documents/:documentId/download", () => {
  it("should return 404 for missing document", async () => {
    const res = await agent.get("/api/documents/999999/download").expect(404);
    expect(res.body.message).toMatch(/not found/i);
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
        extracted_text: "some extracted text",
        pages: [],
        tables: [],
        paragraphs: [],
        styles: [],
        sections: [],
        figures: [],
      },
    });
    // Test the endpoint
    const res = await agent.get(`/api/documents/${documentId}/ocr`).expect(200);
    expect(res.body).toHaveProperty("extracted_text", ocrResult.extracted_text);
    expect(res.body).toHaveProperty("processed_at");
    expect(res.body).toHaveProperty("document_id", documentId);
  });

  it("should return 404 if document exists but no OCR result", async () => {
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
    const res = await agent.get(`/api/documents/${documentId}/ocr`).expect(404);
    expect(res.body.message).toMatch(/No OCR result found/i);
  });

  it("should return 404 for missing document", async () => {
    const res = await agent.get("/api/documents/999999/ocr").expect(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});
