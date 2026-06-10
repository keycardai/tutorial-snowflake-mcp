export interface SnowflakeRequestParams {
  accountUrl: string;
  token: string;
  statement: string;
  database?: string;
  schema?: string;
  warehouse?: string;
  role?: string;
}

export interface SnowflakeResponse {
  resultSetMetaData: {
    numRows: number;
    format: string;
    rowType: Array<{ name: string; type: string }>;
  };
  data: string[][];
  code: string;
  message: string;
  statementHandle: string;
  statementStatusUrl: string;
}

const POLL_INTERVAL_MS = 1000;
const DEFAULT_POLL_TIMEOUT_MS = 30_000;

export async function executeSnowflakeStatement(
  params: SnowflakeRequestParams,
  pollTimeoutMs: number = DEFAULT_POLL_TIMEOUT_MS,
): Promise<SnowflakeResponse> {
  const url = `${params.accountUrl}/api/v2/statements`;

  const body: Record<string, string> = {
    statement: params.statement,
  };
  if (params.database) body.database = params.database;
  if (params.schema) body.schema = params.schema;
  if (params.warehouse) body.warehouse = params.warehouse;
  if (params.role) body.role = params.role;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json",
      "X-Snowflake-Authorization-Token-Type": "OAUTH",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 202) {
    const asyncResult = (await response.json()) as SnowflakeResponse;
    return pollForResult(asyncResult.statementStatusUrl, params.token, pollTimeoutMs);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ code: String(response.status), message: response.statusText }));
    const sfError = errorBody as Partial<SnowflakeResponse>;
    throw new SnowflakeError(
      sfError.message || response.statusText,
      sfError.code || String(response.status),
    );
  }

  return (await response.json()) as SnowflakeResponse;
}

async function pollForResult(
  statusUrl: string,
  token: string,
  timeoutMs: number,
): Promise<SnowflakeResponse> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (response.status === 202) continue;

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ code: String(response.status), message: response.statusText }));
      const sfError = errorBody as Partial<SnowflakeResponse>;
      throw new SnowflakeError(
        sfError.message || response.statusText,
        sfError.code || String(response.status),
      );
    }

    return (await response.json()) as SnowflakeResponse;
  }

  throw new SnowflakeError(
    `Statement execution timed out after ${timeoutMs}ms`,
    "TIMEOUT",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SnowflakeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SnowflakeError";
  }
}
