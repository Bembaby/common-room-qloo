export class AppError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function publicError(error) {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  return { code: 'INTERNAL_ERROR', message: 'The plan could not be completed. No successful result was substituted.' };
}
