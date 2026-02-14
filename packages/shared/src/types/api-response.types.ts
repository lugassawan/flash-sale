export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
  retryAfter?: number;
}

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: ApiError };
