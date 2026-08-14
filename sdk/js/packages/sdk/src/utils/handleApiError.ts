/**
 * Thrown when a backend endpoint requires a higher subscription plan.
 * Catch this specifically to show upgrade prompts instead of generic error UI.
 *
 * @example
 * try {
 *   await client.branding.update({ logoUrl: "https://..." });
 * } catch (e) {
 *   if (e instanceof PlanRequiredError) {
 *     showUpgradePrompt(e.requiredPlan);
 *   }
 * }
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends Error {
  public retryAfterSeconds: number | null;
  constructor(message: string, retryAfterSeconds: number | null) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerError";
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class PlanRequiredError extends Error {
  constructor(public requiredPlan: string) {
    super(`This feature requires the ${requiredPlan} plan`);
    this.name = "PlanRequiredError";
  }
}

export const handleApiError = async (
  response: Response,
  context: string,
): Promise<never> => {
  if (response.status === 404) {
    throw new Error(
      "Motionmesh API route not found. " +
        "Make sure you have created the file at " +
        "app/api/motionmesh/route.ts",
    );
  }

  // Try to extract the real error message
  let errorMessage = "Request failed";
  let errorData: any = null;

  try {
    errorData = await response.json();
  } catch {
    errorData = null;
  }

  // 403 with a plan-gate shape → throw typed PlanRequiredError
  if (response.status === 403 && errorData?.required_plan) {
    throw new PlanRequiredError(errorData.required_plan);
  }

  switch (context) {
    case "initiate":
      errorMessage = "Upload initiation failed";
      break;
    case "complete":
      errorMessage = "Upload completion failed";
      break;
    case "preview":
      errorMessage = "Failed to get the file preview";
      break;
    default:
      break;
  }

  if (errorData?.error) {
    errorMessage = errorData.error;
  } else if (errorData?.message) {
    errorMessage = errorData.message;
  } else if (!errorData) {
    errorMessage = response.statusText || errorMessage;
  }

  const finalMessage = `[Motionmesh] ${errorMessage}`;

  switch (response.status) {
    case 401:
      throw new AuthenticationError(finalMessage);
    case 403:
      throw new AuthorizationError(finalMessage);
    case 404:
      throw new NotFoundError(finalMessage);
    case 409:
      throw new ConflictError(finalMessage);
    case 422:
      throw new ValidationError(finalMessage);
    case 429:
      const retryAfter = response.headers.get("Retry-After");
      const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
      throw new RateLimitError(finalMessage, retryAfterSeconds);
    case 500:
    case 502:
    case 503:
    case 504:
      throw new ServerError(finalMessage);
    default:
      throw new Error(finalMessage);
  }
};
