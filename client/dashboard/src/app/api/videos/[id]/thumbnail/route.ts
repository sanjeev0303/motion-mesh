import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { getToken } = auth();
  const token = await getToken();

  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const baseUrl = process.env.MOTIONMESH_BASE_URL || "http://api:8080/v1";
  
  try {
    const res = await fetch(`${baseUrl}/videos/${params.id}/thumbnail`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      redirect: "manual",
    });

    if (res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
      const location = res.headers.get("location");
      if (location) {
        return NextResponse.redirect(location, { status: res.status });
      }
    }

    if (!res.ok) {
      return new NextResponse(`Error: ${res.statusText}`, { status: res.status });
    }

    return new NextResponse("Unexpected response", { status: 500 });
  } catch (error) {
    console.error("Thumbnail proxy error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
