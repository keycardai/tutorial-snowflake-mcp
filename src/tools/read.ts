import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SnowflakeTokenProvider } from "../tokenProvider.js";
import { registerSnowflakeTool, type ToolConfig } from "./factory.js";

export function registerQueryTool(
  server: McpServer,
  getToken: SnowflakeTokenProvider,
  config: ToolConfig,
): void {
  registerSnowflakeTool(server, getToken, config, {
    name: "snowflake_query",
    description: "Execute a read-only SQL query against Snowflake and return result rows",
    statementDescription: "SQL SELECT statement to execute",
    scope: "session:role:READONLY_ROLE",
    formatResult: (result) => {
      const columns = result.resultSetMetaData.rowType.map((col) => col.name);
      const rows = (result.data ?? []).map((row) => {
        const obj: Record<string, string> = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
      return JSON.stringify({ columns, rows }, null, 2);
    },
  });
}
