import { describe, it, expect } from "vitest";
import { validateStatement } from "./validation.js";

describe("validateStatement", () => {
  const tests: Record<string, { statement: string; category: "query" | "execute" | "delete"; wantError: string | null }> = {
    "query: allows SELECT": {
      statement: "SELECT * FROM students",
      category: "query",
      wantError: null,
    },
    "query: allows WITH (CTE)": {
      statement: "WITH cte AS (SELECT 1) SELECT * FROM cte",
      category: "query",
      wantError: null,
    },
    "query: allows SHOW": {
      statement: "SHOW TABLES",
      category: "query",
      wantError: null,
    },
    "query: allows DESCRIBE": {
      statement: "DESCRIBE TABLE students",
      category: "query",
      wantError: null,
    },
    "query: rejects INSERT": {
      statement: "INSERT INTO students VALUES (1, 'Troy Barnes')",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },
    "query: rejects UPDATE": {
      statement: "UPDATE students SET name = 'Jeff Winger'",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },
    "query: rejects DELETE": {
      statement: "DELETE FROM students WHERE id = 1",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },
    "query: rejects DROP": {
      statement: "DROP TABLE students",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },
    "query: rejects TRUNCATE": {
      statement: "TRUNCATE TABLE students",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },
    "query: rejects CREATE": {
      statement: "CREATE TABLE courses (id INT)",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },
    "query: rejects ALTER": {
      statement: "ALTER TABLE students ADD COLUMN gpa FLOAT",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },
    "query: rejects MERGE": {
      statement: "MERGE INTO target USING source ON target.id = source.id",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },
    "query: case insensitive rejection": {
      statement: "  insert INTO students VALUES (1)",
      category: "query",
      wantError: "snowflake_query only accepts SELECT",
    },

    // execute tool
    "execute: allows INSERT": {
      statement: "INSERT INTO students VALUES (1, 'Annie Edison')",
      category: "execute",
      wantError: null,
    },
    "execute: allows UPDATE": {
      statement: "UPDATE students SET name = 'Britta Perry'",
      category: "execute",
      wantError: null,
    },
    "execute: allows CREATE": {
      statement: "CREATE TABLE paintball_scores (id INT)",
      category: "execute",
      wantError: null,
    },
    "execute: allows ALTER": {
      statement: "ALTER TABLE students ADD COLUMN catchphrase TEXT",
      category: "execute",
      wantError: null,
    },
    "execute: allows MERGE": {
      statement: "MERGE INTO target USING source ON target.id = source.id",
      category: "execute",
      wantError: null,
    },
    "execute: rejects SELECT": {
      statement: "SELECT * FROM students",
      category: "execute",
      wantError: "does not accept SELECT",
    },
    "execute: rejects DELETE": {
      statement: "DELETE FROM students",
      category: "execute",
      wantError: "only accepts INSERT, UPDATE, CREATE, ALTER, or MERGE",
    },
    "execute: rejects DROP": {
      statement: "DROP TABLE students",
      category: "execute",
      wantError: "only accepts INSERT, UPDATE, CREATE, ALTER, or MERGE",
    },
    "execute: rejects TRUNCATE": {
      statement: "TRUNCATE TABLE students",
      category: "execute",
      wantError: "only accepts INSERT, UPDATE, CREATE, ALTER, or MERGE",
    },

    // delete tool
    "delete: allows DELETE": {
      statement: "DELETE FROM students WHERE expelled = true",
      category: "delete",
      wantError: null,
    },
    "delete: allows DROP": {
      statement: "DROP TABLE air_conditioning_repair",
      category: "delete",
      wantError: null,
    },
    "delete: allows TRUNCATE": {
      statement: "TRUNCATE TABLE dean_announcements",
      category: "delete",
      wantError: null,
    },
    "delete: rejects SELECT": {
      statement: "SELECT * FROM students",
      category: "delete",
      wantError: "does not accept SELECT",
    },
    "delete: rejects INSERT": {
      statement: "INSERT INTO students VALUES (1)",
      category: "delete",
      wantError: "does not accept write statements",
    },
    "delete: rejects UPDATE": {
      statement: "UPDATE students SET name = 'Chang'",
      category: "delete",
      wantError: "does not accept write statements",
    },
    "delete: rejects CREATE": {
      statement: "CREATE TABLE evil_study_group (id INT)",
      category: "delete",
      wantError: "does not accept write statements",
    },
  };

  for (const [name, tc] of Object.entries(tests)) {
    it(name, () => {
      const result = validateStatement(tc.statement, tc.category);
      if (tc.wantError === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toContain(tc.wantError);
      }
    });
  }
});
