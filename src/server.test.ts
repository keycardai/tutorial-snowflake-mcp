import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

function setRequiredEnv(): void {
  process.env.KEYCARD_ZONE_URL = "https://test.keycard.cloud";
  process.env.KEYCARD_CLIENT_ID = "greendale-client";
  process.env.KEYCARD_CLIENT_SECRET = "pop-pop";
  process.env.SNOWFLAKE_ACCOUNT_URL = "https://xy12345.us-east-1.snowflakecomputing.com";
}

describe("server env validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("exits with error listing missing required env vars", async () => {
    process.env = { ...originalEnv };
    delete process.env.KEYCARD_ZONE_URL;
    delete process.env.KEYCARD_CLIENT_ID;
    delete process.env.KEYCARD_CLIENT_SECRET;
    delete process.env.SNOWFLAKE_ACCOUNT_URL;

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(async () => {
      const mod = await import("./server.js");
      mod.createApp();
    }).rejects.toThrow("process.exit called");

    const errorMessage = errorSpy.mock.calls[0][0] as string;
    expect(errorMessage).toContain("KEYCARD_ZONE_URL");
    expect(errorMessage).toContain("KEYCARD_CLIENT_ID");
    expect(errorMessage).toContain("KEYCARD_CLIENT_SECRET");
    expect(errorMessage).toContain("SNOWFLAKE_ACCOUNT_URL");

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("exits when only some env vars are missing", async () => {
    process.env = {
      ...originalEnv,
      KEYCARD_ZONE_URL: "https://test.keycard.cloud",
      KEYCARD_CLIENT_ID: "some-id",
    };
    delete process.env.KEYCARD_CLIENT_SECRET;
    delete process.env.SNOWFLAKE_ACCOUNT_URL;

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(async () => {
      const mod = await import("./server.js");
      mod.createApp();
    }).rejects.toThrow("process.exit called");

    const errorMessage = errorSpy.mock.calls[0][0] as string;
    expect(errorMessage).toContain("KEYCARD_CLIENT_SECRET");
    expect(errorMessage).toContain("SNOWFLAKE_ACCOUNT_URL");
    expect(errorMessage).not.toContain("KEYCARD_ZONE_URL");
    expect(errorMessage).not.toContain("KEYCARD_CLIENT_ID");

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("creates app when all required env vars are present", async () => {
    process.env = { ...originalEnv };
    setRequiredEnv();

    const mod = await import("./server.js");
    const app = mod.createApp();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
  });
});

describe("health endpoint", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    setRequiredEnv();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns { status: ok } without auth", async () => {
    const mod = await import("./server.js");
    const app = mod.createApp();

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("/mcp endpoint", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    setRequiredEnv();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("handles GET via transport (no SSE in stateless mode)", async () => {
    const mod = await import("./server.js");
    const app = mod.createApp();

    const res = await request(app).get("/mcp");
    // Transport returns 406 (Not Acceptable) — no SSE stream in stateless mode
    expect(res.status).toBe(406);
  });

  it("handles DELETE via transport (no-op in stateless mode)", async () => {
    const mod = await import("./server.js");
    const app = mod.createApp();

    const res = await request(app).delete("/mcp");
    // Transport accepts DELETE as a session teardown no-op
    expect(res.status).toBe(200);
  });

  it("rejects POST without bearer token with 401", async () => {
    const mod = await import("./server.js");
    const app = mod.createApp();

    const res = await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", method: "initialize", id: 1 });

    expect(res.status).toBe(401);
  });
});
