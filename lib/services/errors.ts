export class ServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
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

export function assertFound<T>(value: T | null | undefined, message: string): T {
  if (!value) {
    throw new ServiceError(message, 404);
  }

  return value;
}
