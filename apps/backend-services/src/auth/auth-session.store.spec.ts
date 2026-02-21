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

  describe("savePKCEState", () => {
    it("should save PKCE state for a given state token", () => {
      store.savePKCEState("state-token", "code-verifier", "nonce-value");
      const pkceState = store.consumePKCEState("state-token");
      expect(pkceState.codeVerifier).toBe("code-verifier");
      expect(pkceState.nonce).toBe("nonce-value");
    });

    it("should allow different state tokens to coexist", () => {
      store.savePKCEState("state1", "verifier1", "nonce1");
      store.savePKCEState("state2", "verifier2", "nonce2");
      const pkce1 = store.consumePKCEState("state1");
      const pkce2 = store.consumePKCEState("state2");
      expect(pkce1.codeVerifier).toBe("verifier1");
      expect(pkce2.codeVerifier).toBe("verifier2");
    });
  });

  describe("consumePKCEState", () => {
    it("should return PKCE state and remove entry when state is valid", () => {
      store.savePKCEState("state-token", "code-verifier", "nonce-value");
      const pkceState = store.consumePKCEState("state-token");
      expect(pkceState).toEqual({
        codeVerifier: "code-verifier",
        nonce: "nonce-value",
      });
      expect(() => store.consumePKCEState("state-token")).toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException when state is unknown", () => {
      expect(() => store.consumePKCEState("unknown-state")).toThrow(
        NotFoundException,
      );
      expect(() => store.consumePKCEState("unknown-state")).toThrow(
        "Invalid or expired OAuth state",
      );
    });

    it("should throw NotFoundException when PKCE state is expired", () => {
      jest.useFakeTimers();
      store.savePKCEState("state-token", "code-verifier", "nonce-value");
      jest.advanceTimersByTime(11 * 60 * 1000); // past 10 minute TTL
      expect(() => store.consumePKCEState("state-token")).toThrow(
        NotFoundException,
      );
      jest.useRealTimers();
    });
  });
});
