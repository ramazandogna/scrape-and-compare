const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Type-safe fetch wrapper for backend API calls
 * @param endpoint API endpoint path (e.g., "/jobs", "/matcher/results/123")
 * @param options Standard RequestInit options
 * @returns Parsed JSON response
 */
export async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new ApiError(response.status, errorBody, endpoint);
  }

  return response.json() as Promise<T>;
}

/**
 * Typed API error with status code and endpoint context
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string
  ) {
    super(`API Error ${status} on ${endpoint}: ${body}`);
    this.name = "ApiError";
  }
}
