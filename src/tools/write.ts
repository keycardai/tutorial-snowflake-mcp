import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SnowflakeTokenProvider } from "../tokenProvider.js";
import { registerSnowflakeTool, type ToolConfig } from "./factory.js";

export function registerExecuteTool(
  server: McpServer,
  getToken: SnowflakeTokenProvider,
  config: ToolConfig,
): void {
  registerSnowflakeTool(server, getToken, config, {
    name: "snowflake_execute",
    description: "Execute a write SQL statement (INSERT, UPDATE, CREATE, ALTER, MERGE) against Snowflake",
    statementDescription: "SQL write statement (INSERT, UPDATE, CREATE, ALTER, MERGE)",
    scope: "session:role:READWRITE_ROLE",
    role: "READWRITE_ROLE",
    formatResult: (result) =>
      `Statement executed successfully. Rows affected: ${result.resultSetMetaData.numRows}`,
  });
}
