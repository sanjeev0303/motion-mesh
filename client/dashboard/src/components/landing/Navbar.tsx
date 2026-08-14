import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-borderSubtle bg-base/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-accent-motion to-accent-mesh flex items-center justify-center">
              <div className="w-4 h-4 bg-base rounded-sm" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Motionmesh</span>
          </Link>
          <div className="hidden md:flex gap-6 text-sm font-medium text-text-muted">
            <Link href="/docs" className="hover:text-text-primary transition-colors">Docs</Link>
            <Link href="#pricing" className="hover:text-text-primary transition-colors">Pricing</Link>
            <Link href="#" className="hover:text-text-primary transition-colors">GitHub</Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SignedOut>
            <Button variant="ghost" className="hidden sm:inline-flex" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button variant="ghost" className="mr-2" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </nav>
  );
}
