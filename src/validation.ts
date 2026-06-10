const READ_FORBIDDEN = /^(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|MERGE)\b/i;
const WRITE_ALLOWED = /^(INSERT|UPDATE|CREATE|ALTER|MERGE)\b/i;
const DELETE_ALLOWED = /^(DELETE|DROP|TRUNCATE)\b/i;

export type StatementCategory = "query" | "execute" | "delete";

export function validateStatement(
  statement: string,
  category: StatementCategory,
): string | null {
  const trimmed = statement.trim();

  switch (category) {
    case "query":
      if (READ_FORBIDDEN.test(trimmed)) {
        return "snowflake_query only accepts SELECT statements. Use snowflake_execute for write operations or snowflake_delete for destructive operations.";
      }
      return null;

    case "execute":
      if (/^SELECT\b/i.test(trimmed)) {
        return "snowflake_execute does not accept SELECT statements. Use snowflake_query instead.";
      }
      if (!WRITE_ALLOWED.test(trimmed)) {
        return "snowflake_execute only accepts INSERT, UPDATE, CREATE, ALTER, or MERGE statements.";
      }
      return null;

    case "delete":
      if (/^SELECT\b/i.test(trimmed)) {
        return "snowflake_delete does not accept SELECT statements. Use snowflake_query instead.";
      }
      if (/^(INSERT|UPDATE|CREATE|ALTER|MERGE)\b/i.test(trimmed)) {
        return "snowflake_delete does not accept write statements. Use snowflake_execute instead.";
      }
      if (!DELETE_ALLOWED.test(trimmed)) {
        return "snowflake_delete only accepts DELETE, DROP, or TRUNCATE statements.";
      }
      return null;
  }
}
