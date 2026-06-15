import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SnowflakeTokenProvider } from "../tokenProvider.js";
import { executeSnowflakeStatement, SnowflakeError, type SnowflakeResponse } from "../snowflake.js";

export interface ToolConfig {
  accountUrl: string;
  database?: string;
  schema?: string;
  warehouse?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  statementDescription: string;
  scope: string;
  role?: string;
  formatResult: (result: SnowflakeResponse) => string;
}

export function registerSnowflakeTool(
  server: McpServer,
  getToken: SnowflakeTokenProvider,
  config: ToolConfig,
  def: ToolDefinition,
): void {
  server.tool(
    def.name,
    def.description,
    {
      statement: z.string().describe(def.statementDescription),
      database: z.string().optional().describe("Override default database"),
      schema: z.string().optional().describe("Override default schema"),
      warehouse: z.string().optional().describe("Override default warehouse"),
    },
    async ({ statement, database, schema, warehouse }) => {
      let token: string;
      try {
        token = await getToken(def.scope);
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
          role: def.role,
        });

        return {
          content: [{ type: "text", text: def.formatResult(result) }],
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
