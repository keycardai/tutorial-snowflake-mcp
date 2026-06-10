/**
 * Exchanges a subject token for a Snowflake-scoped access token with
 * a specific session role. Each tool calls this with its own scope
 * so different tools can assume different Snowflake roles.
 *
 * Returns the raw access token string.
 * Throws on exchange failure.
 */
export type SnowflakeTokenProvider = (scope: string) => Promise<string>;
