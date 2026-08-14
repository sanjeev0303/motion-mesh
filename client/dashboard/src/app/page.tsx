import { Navbar } from "@/components/landing/Navbar";
import { MeshAnimation } from "@/components/landing/MeshAnimation";
import { PipelineSection } from "@/components/landing/PipelineSection";
import { AbrLadder } from "@/components/landing/AbrLadder";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { DemoPlayer } from "@/components/landing/DemoPlayer";
import { PricingSection } from "@/components/landing/PricingSection";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// Removed unused imports

export default function Home() {

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="pt-24 pb-32 overflow-hidden">
          <div className="container mx-auto px-4 flex flex-col items-center text-center">
            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tighter mb-6 max-w-4xl">
              Store once. <br className="hidden md:block" />
              Transcode once. <br className="hidden md:block" />
              Stream everywhere.
            </h1>
            <p className="text-xl text-text-muted mb-12 max-w-2xl">
              Developer-controlled video infrastructure. Fast, reliable, and entirely yours to manage.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-24">
              <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-base font-semibold" asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto h-12 px-8 text-base" asChild>
                <Link href="/docs">View Docs</Link>
              </Button>
            </div>

            {/* Signature Mesh Animation */}
            <MeshAnimation />
          </div>
        </section>

        <PipelineSection />
        <AbrLadder />
        <FeaturesSection />
        <DemoPlayer />
        <PricingSection />
      </main>

      <Footer />
    </div>
  );
}
