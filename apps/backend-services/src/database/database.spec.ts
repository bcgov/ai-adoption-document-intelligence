import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "./database.service";

describe("DatabaseService", () => {
  let service: DatabaseService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      document: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      ocrResult: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("mock-db-url") },
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    // Inject mock Prisma client
    (service as any).prisma = mockPrisma;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createDocument", () => {
    it("should create a document", async () => {
      const docData = {
        title: "Test",
        original_filename: "file.pdf",
        file_path: "/tmp/file.pdf",
        file_type: "pdf",
        file_size: 123,
        metadata: {},
        source: "upload",
        status: "NEW",
      };
      const createdDoc = { id: "1", ...docData };
      mockPrisma.document.create.mockResolvedValue(createdDoc);

      const result = await service.createDocument(docData as any);
      expect(result).toEqual(createdDoc);
      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining(docData),
      });
    });
  });

  // Add more tests for other methods similarly...
});
