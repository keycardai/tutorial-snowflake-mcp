import express from "express";
import {
  keycardMetadataRouter,
  requireBearerAuth,
} from "@keycardai/express";
import { ClientSecret } from "@keycardai/oauth/server/clientSecret";
import { TokenExchangeClient } from "@keycardai/oauth/tokenExchange";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerQueryTool } from "./tools/read.js";
import { registerExecuteTool } from "./tools/write.js";
import { registerDeleteTool } from "./tools/delete.js";
import type { SnowflakeTokenProvider } from "./tokenProvider.js";

/** Auth context set by Keycard bearer auth middleware. */
interface KeycardAuth {
  token: string;
  clientId: string;
  scopes: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: KeycardAuth;
    }
  }
}

const REQUIRED_ENV_VARS = [
  "KEYCARD_ZONE_URL",
  "KEYCARD_CLIENT_ID",
  "KEYCARD_CLIENT_SECRET",
  "SNOWFLAKE_ACCOUNT_URL",
] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error("Missing required environment variables: " + missing.join(", "));
    process.exit(1);
  }
}

export function createApp(): express.Express {
  validateEnv();

  const zoneUrl = process.env.KEYCARD_ZONE_URL!;
  const clientId = process.env.KEYCARD_CLIENT_ID!;
  const clientSecret = process.env.KEYCARD_CLIENT_SECRET!;
  const accountUrl = process.env.SNOWFLAKE_ACCOUNT_URL!;
  const defaultDatabase = process.env.SNOWFLAKE_DATABASE;
  const defaultSchema = process.env.SNOWFLAKE_SCHEMA;
  const defaultWarehouse = process.env.SNOWFLAKE_WAREHOUSE;

  const credential = new ClientSecret(clientId, clientSecret);
  const tokenExchangeClient = new TokenExchangeClient(zoneUrl, { credential });

  const app = express();

  // Request logging
  app.use((req, _res, next) => {
    const hasAuth = req.headers.authorization ? "yes" : "no";
    console.log("--> " + req.method + " " + req.path + " [auth: " + hasAuth + "]");
    next();
  });

  // OAuth discovery (unauthenticated)
  app.use(keycardMetadataRouter({
    issuer: zoneUrl,
    scopesSupported: ["mcp:tools"],
  }));

  // Health check (unauthenticated)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // MCP endpoint
  // Auth only runs on POST (tool invocations). GET/DELETE are handled by
  // the transport in stateless mode with MCP-compliant responses.
  const bearerAuth = requireBearerAuth({ zoneUrl, requiredScopes: ["mcp:tools"] });

  app.all(
    "/mcp",
    express.json(),
    (req, res, next) => {
      if (req.method !== "POST") {
        return next();
      }
      bearerAuth(req, res, (err?: unknown) => {
        if (err) return next(err);
        next();
      });
    },
    async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      const server = new McpServer({
        name: "snowflake-mcp-server",
        version: "1.0.0",
      });

      const config = {
        accountUrl,
        database: defaultDatabase,
        schema: defaultSchema,
        warehouse: defaultWarehouse,
      };

      // Per-request token provider: exchanges the subject token for a
      // Snowflake-scoped token with the requested session role.
      const auth = req.auth;
      const getToken: SnowflakeTokenProvider = async (scope: string) => {
        const exchangeRequest = await credential.prepareTokenExchangeRequest(
          auth!.token,
          accountUrl,
        );
        exchangeRequest.scope = scope;
        const tokenResponse = await tokenExchangeClient.exchangeToken(exchangeRequest);
        return tokenResponse.accessToken;
      };

      if (auth) {
        registerQueryTool(server, getToken, config);
        registerExecuteTool(server, getToken, config);
        registerDeleteTool(server, getToken, config);
      }

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      console.log("<-- " + res.statusCode + " /mcp");
    },
  );

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("!!! " + req.method + " " + req.path + " error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

// Only start when run directly (not imported for tests)
const isMainModule = process.argv[1]?.endsWith("server.ts") ||
  process.argv[1]?.endsWith("server.js");

if (isMainModule) {
  const port = parseInt(process.env.PORT || "3100", 10);
  const app = createApp();
  app.listen(port, "0.0.0.0", () => {
    console.log("Snowflake MCP server listening on http://0.0.0.0:" + port);
    console.log("MCP endpoint: http://0.0.0.0:" + port + "/mcp");
  });
}
