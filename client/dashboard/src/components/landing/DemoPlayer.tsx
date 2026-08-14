"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DemoPlayer() {
  const [resolution, setResolution] = useState("1080p");
  const [captions, setCaptions] = useState("Off");
  const [isPlaying, setIsPlaying] = useState(false);

  // In a real app, this would use hls.js and switch the manifest level.
  // For the landing page demo, we simulate the UI interaction.

  return (
    <section className="py-24 border-t border-borderSubtle bg-surface-raised">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-semibold mb-4">
            Feel the control.
          </h2>
          <p className="text-text-muted text-lg">
            Interact with the player to see how fast quality switches happen.
          </p>
        </div>

        <div className="rounded-xl overflow-hidden border border-borderSubtle bg-base shadow-2xl relative aspect-video group">
          {/* Simulated Video Area */}
          <div className="absolute inset-0 flex items-center justify-center bg-surface">
            {isPlaying ? (
              <div className="relative w-full h-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-surface to-accent-mesh/10 animate-pulse" />
                {captions !== "Off" && (
                  <div className="absolute bottom-16 left-0 right-0 text-center">
                    <span className="bg-base/80 text-text-primary px-3 py-1 rounded text-sm md:text-lg">
                      {captions === "EN" ? "This is a simulated video stream." : "Esta es una transmisión de video simulada."}
                    </span>
                  </div>
                )}
                {/* Simulated resolution switch flash */}
                <div key={resolution} className="absolute inset-0 bg-accent-mesh/20 animate-[fade-out_0.5s_ease-out_forwards]" />
              </div>
            ) : (
              <button 
                onClick={() => setIsPlaying(true)}
                className="w-16 h-16 rounded-full bg-accent-motion/20 flex items-center justify-center border border-accent-motion hover:bg-accent-motion/30 transition-colors"
              >
                <div className="w-0 h-0 border-y-8 border-y-transparent border-l-[12px] border-l-accent-motion ml-1" />
              </button>
            )}
            
            {/* Resolution indicator watermark */}
            <div className="absolute top-4 right-4 font-mono text-xs text-text-muted/50 select-none">
              {resolution} • {captions !== "Off" ? `CC:${captions}` : "NO CC"}
            </div>
          </div>

          {/* Custom Controls Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-base to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsPlaying(!isPlaying)} className="text-text-primary hover:text-accent-motion transition-colors">
                {isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
              </button>
              <div className="h-1 w-32 md:w-64 bg-surface-raised rounded-full overflow-hidden">
                <div className="h-full bg-accent-motion w-1/3" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative group/cc">
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-mono">
                  CC
                </Button>
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover/cc:flex flex-col bg-surface border border-borderSubtle rounded-md overflow-hidden min-w-[80px]">
                  {["Off", "EN", "ES"].map(cc => (
                    <button
                      key={cc}
                      onClick={() => setCaptions(cc)}
                      className={`px-3 py-1.5 text-xs font-mono text-left hover:bg-surface-raised ${captions === cc ? 'text-accent-motion bg-surface-raised' : 'text-text-muted'}`}
                    >
                      {cc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative group/res">
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-mono">
                  {resolution}
                </Button>
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover/res:flex flex-col bg-surface border border-borderSubtle rounded-md overflow-hidden min-w-[80px]">
                  {["1080p", "720p", "480p"].map(res => (
                    <button
                      key={res}
                      onClick={() => setResolution(res)}
                      className={`px-3 py-1.5 text-xs font-mono text-left hover:bg-surface-raised ${resolution === res ? 'text-accent-mesh bg-surface-raised' : 'text-text-muted'}`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
