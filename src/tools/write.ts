import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SnowflakeTokenProvider } from "../tokenProvider.js";
import { executeSnowflakeStatement, SnowflakeError } from "../snowflake.js";
import { validateStatement } from "../validation.js";

const SNOWFLAKE_SCOPE = "session:role:READWRITE_ROLE";

export function registerExecuteTool(
  server: McpServer,
  getToken: SnowflakeTokenProvider,
  config: { accountUrl: string; database?: string; schema?: string; warehouse?: string },
): void {
  server.tool(
    "snowflake_execute",
    "Execute a write SQL statement (INSERT, UPDATE, CREATE, ALTER, MERGE) against Snowflake",
    {
      statement: z.string().describe("SQL write statement (INSERT, UPDATE, CREATE, ALTER, MERGE)"),
      database: z.string().optional().describe("Override default database"),
      schema: z.string().optional().describe("Override default schema"),
      warehouse: z.string().optional().describe("Override default warehouse"),
    },
    async ({ statement, database, schema, warehouse }) => {
      const validationError = validateStatement(statement, "execute");
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
          role: "READWRITE_ROLE",
        });

        return {
          content: [{
            type: "text",
            text: `Statement executed successfully. Rows affected: ${result.resultSetMetaData.numRows}`,
          }],
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
