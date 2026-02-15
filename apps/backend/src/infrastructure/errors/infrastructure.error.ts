export class InfrastructureError extends Error {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'InfrastructureError';
    this.cause = cause;
  }
}
