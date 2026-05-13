import { buildEmail, getChesToken, sendEmail } from "./ches";
import type { AlertmanagerPayload } from "./ches";
import type { Config } from "./config";

const baseConfig: Config = {
  port: 3003,
  adapterSecret: "test-secret",
  chesClientId: "client-id",
  chesClientSecret: "client-secret",
  chesAuthHost: "https://auth.example.com",
  chesHost: "https://ches.example.com",
  chesFromEmail: "alerts@example.com",
  chesToEmails: ["ops@example.com"],
};

const firingPayload: AlertmanagerPayload = {
  version: "4",
  groupKey: "test-group",
  status: "firing",
  receiver: "ches-notifications",
  groupLabels: { alertname: "TestAlert" },
  commonLabels: {
    alertname: "TestAlert",
    severity: "critical",
    job: "backend-services",
  },
  commonAnnotations: {
    summary: "Test summary",
    description: "Test description",
  },
  externalURL: "http://alertmanager:9093",
  alerts: [
    {
      status: "firing",
      labels: {
        alertname: "TestAlert",
        severity: "critical",
        job: "backend-services",
      },
      annotations: { summary: "Test summary", description: "Test description" },
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "http://prometheus:9090",
    },
  ],
};

describe("getChesToken", () => {
  it("returns the access_token from a successful response", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "token-abc" }),
    } as unknown as Response);

    const token = await getChesToken(baseConfig);
    expect(token).toBe("token-abc");
  });

  it("throws when the token endpoint returns an error", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as unknown as Response);

    await expect(getChesToken(baseConfig)).rejects.toThrow(
      "CHES token request failed: 401 Unauthorized",
    );
  });
});

describe("buildEmail", () => {
  it("sets high priority for critical alerts", () => {
    const email = buildEmail(firingPayload, baseConfig);
    expect(email.priority).toBe("high");
  });

  it("sets normal priority for warning alerts", () => {
    const warningPayload: AlertmanagerPayload = {
      ...firingPayload,
      commonLabels: { ...firingPayload.commonLabels, severity: "warning" },
    };
    const email = buildEmail(warningPayload, baseConfig);
    expect(email.priority).toBe("normal");
  });

  it("uses the configured from/to addresses", () => {
    const email = buildEmail(firingPayload, baseConfig);
    expect(email.from).toBe("alerts@example.com");
    expect(email.to).toEqual(["ops@example.com"]);
  });

  it("includes the alert name and severity in the subject", () => {
    const email = buildEmail(firingPayload, baseConfig);
    expect(email.subject).toContain("TestAlert");
    expect(email.subject).toContain("CRITICAL");
  });
});

describe("sendEmail", () => {
  it("posts to CHES and resolves on success", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        txId: "tx-123",
        messages: [{ msgId: "msg-456", to: ["ops@example.com"] }],
      }),
    } as unknown as Response);

    const email = buildEmail(firingPayload, baseConfig);
    await expect(sendEmail("token-abc", email, baseConfig)).resolves.toBeUndefined();
  });

  it("throws when CHES returns an error", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as unknown as Response);

    const email = buildEmail(firingPayload, baseConfig);
    await expect(sendEmail("token-abc", email, baseConfig)).rejects.toThrow(
      "CHES email send failed: 500",
    );
  });
});
