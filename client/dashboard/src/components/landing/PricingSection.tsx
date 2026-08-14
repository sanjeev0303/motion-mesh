"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@/lib/api-client";
import { toast } from "sonner";

export function PricingSection() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [storageGb, setStorageGb] = useState(500);
  const [transcodeMins, setTranscodeMins] = useState(1000);

  const STORAGE_RATE = 0.023; // per GB/month
  const TRANSCODE_RATE = 0.005; // per minute

  const estimatedCost = (storageGb * STORAGE_RATE) + (transcodeMins * TRANSCODE_RATE);

  const tiers = [
    {
      name: "Starter",
      price: "Pay as you go",
      desc: "For side projects and prototypes.",
      features: ["100 GB storage included", "500 transcode minutes included", "Community support"]
    },
    {
      name: "Pro",
      price: "$49/mo",
      desc: "For production applications.",
      features: ["1 TB storage included", "5,000 transcode minutes included", "Priority email support", "Custom CNAME"],
      priceId: "price_1TzqevRmntiG21b1f8dlmnJf"
    },
    {
      name: "Scale",
      price: "Custom",
      desc: "For high-volume platforms.",
      features: ["Custom storage allocation", "Volume discounts", "Dedicated Slack channel", "SLA guarantees", "Custom ingest endpoints"]
    }
  ];

  return (
    <section id="pricing" className="py-24 border-t border-borderSubtle bg-base">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-display font-semibold mb-4">
            Simple, predictable pricing.
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            No complex calculators. Pay for exactly what you store and what you encode.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
          {tiers.map((tier, i) => (
            <div key={tier.name} className={`p-8 rounded-xl border ${i === 1 ? 'border-accent-motion bg-surface-raised relative' : 'border-borderSubtle bg-surface'}`}>
              {i === 1 && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-motion text-base text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
              )}
              <h3 className="font-display text-2xl font-semibold mb-2">{tier.name}</h3>
              <p className="text-text-muted text-sm mb-6">{tier.desc}</p>
              <div className="text-3xl font-bold mb-8">{tier.price}</div>
              <ul className="space-y-4 mb-8">
                {tier.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm">
                    <svg className="w-5 h-5 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                variant={i === 1 ? "default" : "outline"} 
                className="w-full"
                disabled={loadingTier === tier.name}
                onClick={async () => {
                  if (tier.name === "Scale") {
                    window.location.href = "mailto:sales@motionmesh.co.in";
                    return;
                  }
                  
                  if (!isLoaded) return;
                  
                  if (!isSignedIn) {
                    router.push("/signup?redirect_url=" + encodeURIComponent("/dashboard/billing"));
                    return;
                  }

                  if (tier.priceId) {
                    setLoadingTier(tier.name);
                    try {
                      const api = createAuthClient(getToken);
                      const { data, error, response } = await api.POST("/v1/billing/checkout", {
                        body: {
                          price_id: tier.priceId,
                          return_url: window.location.origin + "/dashboard/billing"
                        }
                      });
                      
                      if (error || !response.ok) {
                        toast.error("Failed to start checkout process.");
                      } else if (data?.url) {
                        window.location.href = data.url;
                      }
                    } catch (err) {
                      toast.error("An error occurred. Please try again.");
                    } finally {
                      setLoadingTier(null);
                    }
                  } else {
                    router.push("/dashboard");
                  }
                }}
              >
                {loadingTier === tier.name ? "Loading..." : (i === 2 ? "Contact Sales" : "Get Started")}
              </Button>
            </div>
          ))}
        </div>

        {/* Interactive Estimator */}
        <div className="max-w-4xl mx-auto bg-surface border border-borderSubtle rounded-xl p-8 md:p-12">
          <h3 className="font-display text-2xl font-semibold mb-8">Estimate your usage</h3>
          
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="w-full md:w-2/3 space-y-8">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="font-semibold">Storage (GB)</label>
                  <span className="font-mono text-accent-mesh">{storageGb.toLocaleString()} GB</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="10000" 
                  step="100"
                  value={storageGb}
                  onChange={(e) => setStorageGb(Number(e.target.value))}
                  className="w-full h-2 bg-base rounded-lg appearance-none cursor-pointer accent-accent-mesh"
                />
                <div className="text-xs text-text-muted mt-2 font-mono">${STORAGE_RATE}/GB</div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="font-semibold">Transcode Minutes</label>
                  <span className="font-mono text-accent-motion">{transcodeMins.toLocaleString()} mins</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="10000" 
                  step="100"
                  value={transcodeMins}
                  onChange={(e) => setTranscodeMins(Number(e.target.value))}
                  className="w-full h-2 bg-base rounded-lg appearance-none cursor-pointer accent-accent-motion"
                />
                <div className="text-xs text-text-muted mt-2 font-mono">${TRANSCODE_RATE}/min</div>
              </div>
            </div>

            <div className="w-full md:w-1/3 flex flex-col items-center justify-center p-8 bg-surface-raised rounded-lg border border-borderSubtle">
              <span className="text-text-muted mb-2">Estimated Monthly</span>
              <div className="text-5xl font-display font-bold text-text-primary mb-6">
                ${estimatedCost.toFixed(2)}
              </div>
              <Button>Start Building</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
