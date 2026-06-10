# Snowflake MCP Server

A Keycard-protected MCP server that gives Claude Code read/write/delete access
to Snowflake. Authentication flows through [Keycard](https://keycard.ai) — the
server uses delegated access (RFC 8693 token exchange) to obtain Snowflake tokens
on every request.

## How It Works

```
┌──────────────┐      ┌─────────────────┐      ┌─────────┐      ┌───────────┐
│  Claude Code │─────▶│  MCP Server     │─────▶│ Keycard │─────▶│ Snowflake │
│              │      │  localhost:3100 │      │         │      │           │
└──────────────┘      └─────────────────┘      └─────────┘      └───────────┘
       │                      │                      │                 │
       │  1. OAuth login      │                      │                 │
       │  (first use only)    │                      │                 │
       │─────────────────────────────────────────────▶                 │
       │                      │                      │                 │
       │  2. Tool call + bearer token                │                 │
       │─────────────────────▶│                      │                 │
       │                      │                      │                 │
       │                      │  3. Exchange token   │                 │
       │                      │  for requested role  │                 │
       │                      │─────────────────────▶│                 │
       │                      │                      │                 │
       │                      │  4. Policy evaluation│                 │
       │                      │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│                 │
       │                      │  (approve/deny)      │                 │
       │                      │                      │                 │
       │                      │  5. Execute SQL      │                 │
       │                      │─────────────────────────────────────▶│
       │                      │                      │                 │
       │  6. Results          │                      │                 │
       │◀─────────────────────│                      │                 │
```

## Role-Based Access

Each tool requests a different Snowflake role via Keycard token exchange:

| Tool | Snowflake Role | Allowed Statements |
|------|----------------|-------------------|
| `snowflake_query` | `READONLY_ROLE` | SELECT, SHOW, DESCRIBE |
| `snowflake_execute` | `ANALYST_ROLE` | INSERT, UPDATE, CREATE, ALTER, MERGE |
| `snowflake_delete` | `ANALYST_ROLE` | DELETE, DROP, TRUNCATE |

Keycard policies can allow or deny access based on which role is requested. For
example, you might:
- Always allow `READONLY_ROLE` (read queries)
- Require human approval for `ANALYST_ROLE` (write/delete operations)

When a tool requests a role that requires approval, Keycard prompts the user
before issuing the token.

## Running the Server

Prerequisites: Keycard zone configured with Snowflake WIF, `.env` populated.

```bash
# With Docker
docker compose up -d

# Without Docker
npm install
npm run dev    # development
npm start      # production (after npm run build)
```

The server runs at `http://localhost:3100/mcp`.

## Connecting from Claude Code

Add to your MCP settings (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "Snowflake-MCP": {
      "type": "streamable-http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

On first use, Claude Code opens Keycard for authentication. After that, just ask
questions about your data:

> "List all students in my greendale database"
> "Insert a new record into the users table"
> "Show me the schema for the orders table"

## License

MIT
