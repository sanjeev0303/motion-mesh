export interface EnvConfig {
    baseUrl: string;
}


export const getEnvConfig = (): EnvConfig => {
  return {
    baseUrl: process.env.MOTIONMESH_BASE_URL || "http://localhost:8000/api/v1",
  };
};

