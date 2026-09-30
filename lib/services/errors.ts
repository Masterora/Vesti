export class ServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code =
      code ??
      {
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "STATE_CONFLICT",
        422: "INVALID_TRANSACTION",
        503: "CHAIN_UNAVAILABLE",
      }[status] ??
      "INVALID_REQUEST";
  }
}

export function assertAllowed(condition: boolean, message: string) {
  if (!condition) {
    throw new ServiceError(message, 403);
  }
}

export function assertState(condition: boolean, message: string) {
  if (!condition) {
    throw new ServiceError(message, 409);
  }
}

export function assertFound<T>(
  value: T | null | undefined,
  message: string,
): T {
  if (!value) {
    throw new ServiceError(message, 404);
  }

  return value;
}
