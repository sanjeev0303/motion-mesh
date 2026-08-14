import { handleProcessRequest } from "@motionmesh/sdk/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: Request) {
  const { getToken } = auth();
  
  return handleProcessRequest({ 
    request, 
    resolveCredential: async () => {
      const token = await getToken();
      return token || process.env.MOTIONMESH_API_KEY || "";
    }
  });
}
