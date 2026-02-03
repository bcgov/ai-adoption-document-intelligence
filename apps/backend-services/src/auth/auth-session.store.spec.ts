import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthSessionStore } from "./auth-session.store";
import { TokenResponseDto } from "./dto/token-response.dto";

describe("AuthSessionStore", () => {
  let store: AuthSessionStore;

  const mockTokens: TokenResponseDto = {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "Bearer",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSessionStore,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === "AUTH_RESULT_TTL_SECONDS" ? "60" : undefined,
            ),
          },
        },
      ],
    }).compile();

    store = module.get<AuthSessionStore>(AuthSessionStore);
  });

  describe("save", () => {
    it("returns a non-empty id", () => {
      const id = store.save(mockTokens);
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });

    it("returns different ids for different saves", () => {
      const id1 = store.save(mockTokens);
      const id2 = store.save({ ...mockTokens, access_token: "other" });
      expect(id1).not.toBe(id2);
    });
  });

  describe("consume", () => {
    it("returns tokens and removes entry when id is valid", () => {
      const id = store.save(mockTokens);
      const tokens = store.consume(id);
      expect(tokens).toEqual(mockTokens);
      expect(() => store.consume(id)).toThrow(NotFoundException);
    });

    it("throws NotFoundException when id is unknown", () => {
      expect(() => store.consume("unknown-id")).toThrow(NotFoundException);
      expect(() => store.consume("unknown-id")).toThrow(
        "Auth result expired or invalid",
      );
    });

    it("throws NotFoundException when entry is expired", () => {
      jest.useFakeTimers();
      const id = store.save(mockTokens);
      jest.advanceTimersByTime(61 * 1000); // past 60s TTL
      expect(() => store.consume(id)).toThrow(NotFoundException);
      jest.useRealTimers();
    });
  });
});
