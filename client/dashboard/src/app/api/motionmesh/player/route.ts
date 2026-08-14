import { handleProcessRequest } from "@motionmesh/player/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: Request) {
  const { getToken } = await auth();
  const token = await getToken();
  const apiKey = token || process.env.MOTIONMESH_API_KEY || "";
  return handleProcessRequest({ request, apiKey });
}

export async function GET(request: Request) {
  const { getToken } = await auth();
  const token = await getToken();
  const apiKey = token || process.env.MOTIONMESH_API_KEY || "";
  return handleProcessRequest({ request, apiKey });
}
