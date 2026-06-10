import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  executeSnowflakeStatement,
  SnowflakeError,
  type SnowflakeResponse,
} from "./snowflake.js";

const ACCOUNT_URL = "https://xy12345.us-east-1.snowflakecomputing.com";

function mockSnowflakeResponse(overrides: Partial<SnowflakeResponse> = {}): SnowflakeResponse {
  return {
    resultSetMetaData: {
      numRows: 1,
      format: "jsonv2",
      rowType: [{ name: "ID", type: "fixed" }, { name: "NAME", type: "text" }],
    },
    data: [["1", "Troy Barnes"]],
    code: "090000",
    message: "Statement executed successfully.",
    statementHandle: "01b4d5f2-0000-0000-0000-000000000000",
    statementStatusUrl: `${ACCOUNT_URL}/api/v2/statements/01b4d5f2-0000-0000-0000-000000000000`,
    ...overrides,
  };
}

describe("executeSnowflakeStatement", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends correct request to Snowflake SQL API", async () => {
    const response = mockSnowflakeResponse();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    await executeSnowflakeStatement({
      accountUrl: ACCOUNT_URL,
      token: "sf-token-greendale",
      statement: "SELECT * FROM students",
      database: "GREENDALE_DB",
      schema: "PUBLIC",
      warehouse: "STUDY_GROUP_WH",
    });

    expect(fetch).toHaveBeenCalledWith(
      `${ACCOUNT_URL}/api/v2/statements`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          statement: "SELECT * FROM students",
          database: "GREENDALE_DB",
          schema: "PUBLIC",
          warehouse: "STUDY_GROUP_WH",
        }),
      }),
    );

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sf-token-greendale");
    expect(headers["X-Snowflake-Authorization-Token-Type"]).toBe("OAUTH");
  });

  it("returns Snowflake response on success", async () => {
    const response = mockSnowflakeResponse();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    const result = await executeSnowflakeStatement({
      accountUrl: ACCOUNT_URL,
      token: "token",
      statement: "SELECT 1",
    });

    expect(result.data).toEqual([["1", "Troy Barnes"]]);
    expect(result.resultSetMetaData.rowType).toHaveLength(2);
  });

  it("omits optional fields from request body when not provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSnowflakeResponse()), { status: 200 }),
    );

    await executeSnowflakeStatement({
      accountUrl: ACCOUNT_URL,
      token: "token",
      statement: "SELECT 1",
    });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ statement: "SELECT 1" });
    expect(body).not.toHaveProperty("database");
    expect(body).not.toHaveProperty("schema");
    expect(body).not.toHaveProperty("warehouse");
  });

  it("throws SnowflakeError on non-OK response", async () => {
    const errorPayload = { code: "002003", message: "SQL compilation error: Object 'FAKE' does not exist." };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(errorPayload), { status: 422 }),
    );

    const err = await executeSnowflakeStatement({
      accountUrl: ACCOUNT_URL,
      token: "token",
      statement: "SELECT * FROM FAKE",
    }).catch((e) => e);

    expect(err).toBeInstanceOf(SnowflakeError);
    expect(err.message).toContain("Object 'FAKE' does not exist");
    expect(err.code).toBe("002003");
  });

  it("polls async statement (HTTP 202) until complete", async () => {
    const statusUrl = `${ACCOUNT_URL}/api/v2/statements/async-handle`;
    const asyncResponse = mockSnowflakeResponse({ statementStatusUrl: statusUrl });
    const finalResponse = mockSnowflakeResponse({
      data: [["42", "Abed Nadir"]],
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(asyncResponse), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(asyncResponse), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(finalResponse), { status: 200 }),
      );

    const result = await executeSnowflakeStatement(
      { accountUrl: ACCOUNT_URL, token: "token", statement: "SELECT big_query()" },
      10_000,
    );

    expect(result.data).toEqual([["42", "Abed Nadir"]]);
    // Initial POST + 2 polls
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(statusUrl);
  });

  it("times out polling after configured duration", async () => {
    const statusUrl = `${ACCOUNT_URL}/api/v2/statements/slow-handle`;
    const asyncResponse = mockSnowflakeResponse({ statementStatusUrl: statusUrl });

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(asyncResponse), { status: 202 }),
    );

    await expect(
      executeSnowflakeStatement(
        { accountUrl: ACCOUNT_URL, token: "token", statement: "SELECT slow()" },
        50, // 50ms timeout — should fail fast
      ),
    ).rejects.toThrow("timed out");
  });

  it("throws on poll error response", async () => {
    const statusUrl = `${ACCOUNT_URL}/api/v2/statements/err-handle`;
    const asyncResponse = mockSnowflakeResponse({ statementStatusUrl: statusUrl });

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(asyncResponse), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "000123", message: "Señor Chang says no" }),
          { status: 500 },
        ),
      );

    await expect(
      executeSnowflakeStatement(
        { accountUrl: ACCOUNT_URL, token: "token", statement: "SELECT fail()" },
        10_000,
      ),
    ).rejects.toThrow("Señor Chang says no");
  });
});
