export interface EnvConfig {
    baseUrl: string;
}

/**
 * Internal SDK endpoint configuration.
 *
 * The public MotionMeshClient constructor intentionally accepts only an API key.
 * This endpoint is controlled by the SDK package, not by individual consumers.
 */
export const getEnvConfig = (): EnvConfig => ({
    baseUrl: "https://api.motionmesh.co.in/v1",
});
