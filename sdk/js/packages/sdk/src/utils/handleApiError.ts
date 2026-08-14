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

  throw new Error(`[Motionmesh] ${errorMessage}`);
};
