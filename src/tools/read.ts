import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SnowflakeTokenProvider } from "../tokenProvider.js";
import { executeSnowflakeStatement, SnowflakeError } from "../snowflake.js";
import { validateStatement } from "../validation.js";

const SNOWFLAKE_SCOPE = "session:role:READONLY_ROLE";

export function registerQueryTool(
  server: McpServer,
  getToken: SnowflakeTokenProvider,
  config: { accountUrl: string; database?: string; schema?: string; warehouse?: string },
): void {
  server.tool(
    "snowflake_query",
    "Execute a read-only SQL query against Snowflake and return result rows",
    {
      statement: z.string().describe("SQL SELECT statement to execute"),
      database: z.string().optional().describe("Override default database"),
      schema: z.string().optional().describe("Override default schema"),
      warehouse: z.string().optional().describe("Override default warehouse"),
    },
    async ({ statement, database, schema, warehouse }) => {
      const validationError = validateStatement(statement, "query");
      if (validationError) {
        return { content: [{ type: "text", text: validationError }], isError: true };
      }

      let token: string;
      try {
        token = await getToken(SNOWFLAKE_SCOPE);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Snowflake token exchange failed: ${(error as Error).message}` }],
          isError: true,
        };
      }

      try {
        const result = await executeSnowflakeStatement({
          accountUrl: config.accountUrl,
          token,
          statement,
          database: database ?? config.database,
          schema: schema ?? config.schema,
          warehouse: warehouse ?? config.warehouse,
        });

        const columns = result.resultSetMetaData.rowType.map((col) => col.name);
        const rows = (result.data ?? []).map((row) => {
          const obj: Record<string, string> = {};
          columns.forEach((col, i) => {
            obj[col] = row[i];
          });
          return obj;
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ columns, rows }, null, 2) }],
        };
      } catch (error) {
        if (error instanceof SnowflakeError) {
          return {
            content: [{ type: "text", text: `Snowflake error [${error.code}]: ${error.message}` }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );
}
