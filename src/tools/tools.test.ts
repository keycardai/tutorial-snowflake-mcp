import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQueryTool } from "./read.js";
import { registerExecuteTool } from "../tools/write.js";
import { registerDeleteTool } from "../tools/delete.js";
import type { SnowflakeResponse } from "../snowflake.js";
import type { SnowflakeTokenProvider } from "../tokenProvider.js";

const ACCOUNT_URL = "https://xy12345.us-east-1.snowflakecomputing.com";

function mockSnowflakeResponse(overrides: Partial<SnowflakeResponse> = {}): SnowflakeResponse {
  return {
    resultSetMetaData: {
      numRows: 2,
      format: "jsonv2",
      rowType: [
        { name: "ID", type: "fixed" },
        { name: "NAME", type: "text" },
      ],
    },
    data: [
      ["1", "Troy Barnes"],
      ["2", "Abed Nadir"],
    ],
    code: "090000",
    message: "Statement executed successfully.",
    statementHandle: "handle-123",
    statementStatusUrl: `${ACCOUNT_URL}/api/v2/statements/handle-123`,
    ...overrides,
  };
}

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  return {
    accountUrl: ACCOUNT_URL,
    database: "GREENDALE_DB",
    schema: "PUBLIC",
    warehouse: "STUDY_GROUP_WH",
    ...overrides,
  };
}

function makeTokenProvider(token: string = "sf-access-token"): SnowflakeTokenProvider {
  return vi.fn().mockResolvedValue(token);
}

function makeFailingTokenProvider(message: string = "access_denied"): SnowflakeTokenProvider {
  return vi.fn().mockRejectedValue(new Error(message));
}

// Helper to invoke a tool by calling the server's internal handler
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const registeredTools = (server as any)._registeredTools as Record<
    string,
    { handler: (args: any, extra: any) => Promise<any> }
  >;
  const tool = registeredTools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not found`);
  return tool.handler(args, {});
}

describe("snowflake_query tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes SELECT and returns rows as JSON", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSnowflakeResponse()), { status: 200 }),
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTool(server, makeTokenProvider(), makeConfig());

    const result = await callTool(server, "snowflake_query", {
      statement: "SELECT * FROM students",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.columns).toEqual(["ID", "NAME"]);
    expect(parsed.rows).toEqual([
      { ID: "1", NAME: "Troy Barnes" },
      { ID: "2", NAME: "Abed Nadir" },
    ]);
  });

  it("requests READONLY_ROLE scope", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSnowflakeResponse()), { status: 200 }),
    );

    const getToken = makeTokenProvider();
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTool(server, getToken, makeConfig());

    await callTool(server, "snowflake_query", { statement: "SELECT 1" });

    expect(getToken).toHaveBeenCalledWith("session:role:READONLY_ROLE");
  });

  it("returns empty rows for empty result set", async () => {
    const emptyResponse = mockSnowflakeResponse({
      resultSetMetaData: {
        numRows: 0,
        format: "jsonv2",
        rowType: [{ name: "ID", type: "fixed" }],
      },
      data: [],
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(emptyResponse), { status: 200 }),
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTool(server, makeTokenProvider(), makeConfig());

    const result = await callTool(server, "snowflake_query", {
      statement: "SELECT * FROM empty_table",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.rows).toEqual([]);
    expect(parsed.columns).toEqual(["ID"]);
  });

  it("returns error when token exchange fails", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTool(server, makeFailingTokenProvider("User has not connected Snowflake"), makeConfig());

    const result = await callTool(server, "snowflake_query", {
      statement: "SELECT 1",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("token exchange failed");
    expect(result.content[0].text).toContain("User has not connected Snowflake");
  });

  it("returns Snowflake error details on API failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "002003", message: "Object 'FAKE' does not exist." }),
        { status: 422 },
      ),
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTool(server, makeTokenProvider(), makeConfig());

    const result = await callTool(server, "snowflake_query", {
      statement: "SELECT * FROM FAKE",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("002003");
    expect(result.content[0].text).toContain("Object 'FAKE' does not exist");
  });

  it("uses override database/schema/warehouse when provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSnowflakeResponse()), { status: 200 }),
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTool(server, makeTokenProvider(), makeConfig());

    await callTool(server, "snowflake_query", {
      statement: "SELECT 1",
      database: "CITY_COLLEGE_DB",
      schema: "EVIL",
      warehouse: "DEAN_WH",
    });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.database).toBe("CITY_COLLEGE_DB");
    expect(body.schema).toBe("EVIL");
    expect(body.warehouse).toBe("DEAN_WH");
  });

  it("falls back to default database/schema/warehouse", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSnowflakeResponse()), { status: 200 }),
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTool(server, makeTokenProvider(), makeConfig());

    await callTool(server, "snowflake_query", {
      statement: "SELECT 1",
    });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.database).toBe("GREENDALE_DB");
    expect(body.schema).toBe("PUBLIC");
    expect(body.warehouse).toBe("STUDY_GROUP_WH");
  });
});

describe("snowflake_execute tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes INSERT and returns row count", async () => {
    const response = mockSnowflakeResponse({ resultSetMetaData: { numRows: 1, format: "jsonv2", rowType: [] } });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerExecuteTool(server, makeTokenProvider(), makeConfig());

    const result = await callTool(server, "snowflake_execute", {
      statement: "INSERT INTO students VALUES (3, 'Shirley Bennett')",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Rows affected: 1");
  });

  it("requests READWRITE_ROLE scope", async () => {
    const response = mockSnowflakeResponse({ resultSetMetaData: { numRows: 1, format: "jsonv2", rowType: [] } });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    const getToken = makeTokenProvider();
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerExecuteTool(server, getToken, makeConfig());

    await callTool(server, "snowflake_execute", {
      statement: "INSERT INTO students VALUES (3, 'Shirley Bennett')",
    });

    expect(getToken).toHaveBeenCalledWith("session:role:READWRITE_ROLE");
  });

  it("returns error when token exchange fails", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerExecuteTool(server, makeFailingTokenProvider("access_denied"), makeConfig());

    const result = await callTool(server, "snowflake_execute", {
      statement: "INSERT INTO students VALUES (1, 'Dean Pelton')",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("token exchange failed");
  });
});

describe("snowflake_delete tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes DELETE and returns row count", async () => {
    const response = mockSnowflakeResponse({ resultSetMetaData: { numRows: 5, format: "jsonv2", rowType: [] } });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerDeleteTool(server, makeTokenProvider(), makeConfig());

    const result = await callTool(server, "snowflake_delete", {
      statement: "DELETE FROM students WHERE expelled = true",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Rows affected: 5");
  });

  it("requests READWRITE_ROLE scope", async () => {
    const response = mockSnowflakeResponse({ resultSetMetaData: { numRows: 5, format: "jsonv2", rowType: [] } });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    const getToken = makeTokenProvider();
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerDeleteTool(server, getToken, makeConfig());

    await callTool(server, "snowflake_delete", {
      statement: "DELETE FROM students WHERE expelled = true",
    });

    expect(getToken).toHaveBeenCalledWith("session:role:READWRITE_ROLE");
  });

  it("executes DROP and returns success", async () => {
    const response = mockSnowflakeResponse({ resultSetMetaData: { numRows: 0, format: "jsonv2", rowType: [] } });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerDeleteTool(server, makeTokenProvider(), makeConfig());

    const result = await callTool(server, "snowflake_delete", {
      statement: "DROP TABLE paintball_arena",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Statement executed successfully");
  });

  it("returns error when token exchange fails", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerDeleteTool(server, makeFailingTokenProvider("access_denied"), makeConfig());

    const result = await callTool(server, "snowflake_delete", {
      statement: "DELETE FROM students WHERE id = 1",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("token exchange failed");
  });
});
