import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Authentication - MotionMesh",
  description: "Sign in or create an account.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-base p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-accent-motion to-accent-mesh flex items-center justify-center">
              <div className="w-4 h-4 bg-base rounded-sm" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-text-primary">Motionmesh</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
