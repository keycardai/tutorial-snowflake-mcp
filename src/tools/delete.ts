import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SnowflakeTokenProvider } from "../tokenProvider.js";
import { registerSnowflakeTool, type ToolConfig } from "./factory.js";

export function registerDeleteTool(
  server: McpServer,
  getToken: SnowflakeTokenProvider,
  config: ToolConfig,
): void {
  registerSnowflakeTool(server, getToken, config, {
    name: "snowflake_delete",
    description: "Execute a destructive SQL statement (DELETE, DROP, TRUNCATE) against Snowflake",
    statementDescription: "SQL destructive statement (DELETE, DROP, TRUNCATE)",
    scope: "session:role:READWRITE_ROLE",
    role: "READWRITE_ROLE",
    formatResult: (result) =>
      `Statement executed successfully. Rows affected: ${result.resultSetMetaData.numRows}`,
  });
}
