"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export function MeshAnimation() {
  const shouldReduceMotion = useReducedMotion();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return <div className="h-[400px] w-full rounded-xl bg-surface/50 border border-borderSubtle animate-pulse" />;

  const resolutions = ["1080p", "720p", "480p", "360p", "240p"];
  const nodes = Array.from({ length: 5 });

  // If reduced motion is preferred, render the static final state
  const duration = shouldReduceMotion ? 0 : 0.8;
  const stagger = shouldReduceMotion ? 0 : 0.15;

  return (
    <div className="relative w-full h-[400px] md:h-[500px] rounded-xl border border-borderSubtle bg-surface/30 overflow-hidden flex items-center justify-center">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#232838_1px,transparent_1px),linear-gradient(to_bottom,#232838_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-20" />

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, margin: "-100px" }}
        className="relative w-full max-w-4xl px-4 flex items-center justify-between"
      >
        {/* Step 1: Storage / Ingest */}
        <div className="flex flex-col items-center gap-2 z-10 relative">
          {/* Object Blocks flying in */}
          {!shouldReduceMotion && (
             <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-2">
                {[1, 2, 3].map((i) => (
                  <motion.div
                    key={`block-${i}`}
                    initial={{ y: -30, opacity: 0 }}
                    whileInView={{ y: 20, opacity: [0, 1, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                    className="w-3 h-3 bg-accent-motion rounded-[2px]"
                  />
                ))}
             </div>
          )}

          <motion.div
            variants={{
              hidden: { opacity: 0, scale: 0.5 },
              visible: { opacity: 1, scale: [0.5, 1.1, 1], transition: { duration, times: [0, 0.7, 1] } }
            }}
            className="relative w-24 h-20 md:w-32 md:h-24 bg-surface border-2 border-accent-motion rounded-lg flex flex-col items-center justify-center shadow-[0_0_15px_rgba(255,138,61,0.2)]"
          >
            {/* Simple bucket icon / shape */}
            <div className="w-12 h-4 border border-accent-motion rounded-[50%] mb-1" />
            <div className="w-12 h-10 border-x border-b border-accent-motion rounded-b-xl flex items-center justify-center bg-accent-motion/10">
               <div className="w-2 h-2 rounded-full bg-accent-motion animate-pulse" />
            </div>
            <span className="font-mono text-xs text-text-primary mt-2">raw-assets</span>
          </motion.div>
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider mt-2">Store</span>
        </div>

        {/* Connecting Lines Source -> ABR */}
        <div className="absolute left-[12%] right-[48%] h-full flex flex-col justify-center pointer-events-none">
          {resolutions.map((_, i) => (
            <motion.div
              key={`line-1-${i}`}
              variants={{
                hidden: { pathLength: 0, opacity: 0 },
                visible: { pathLength: 1, opacity: 0.3, transition: { duration, delay: 0.8 + i * stagger } }
              }}
              className="absolute left-0 w-full border-t border-borderSubtle"
              style={{ top: `${20 + i * 15}%`, transformOrigin: "left center", rotate: `${(i - 2) * 8}deg` }}
            />
          ))}
        </div>

        {/* Step 2: ABR Ladder */}
        <div className="flex flex-col gap-3 md:gap-4 z-10 py-8">
          {resolutions.map((res, i) => (
            <motion.div
              key={res}
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0, transition: { duration, delay: 1.2 + i * stagger } }
              }}
              className="w-20 h-10 md:w-24 md:h-12 bg-surface-raised border border-borderSubtle rounded flex items-center justify-center relative group"
            >
              <span className="font-mono text-xs text-text-primary">{res}</span>
              {/* Particles streaming out */}
              {!shouldReduceMotion && (
                <motion.div
                  initial={{ x: 0, opacity: 0 }}
                  animate={{ x: 100, opacity: [0, 1, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 1.2 + i * 0.4, ease: "linear" }}
                  className="absolute right-0 w-2 h-2 rounded-sm bg-accent-mesh"
                />
              )}
            </motion.div>
          ))}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 font-mono text-[10px] text-text-muted uppercase tracking-wider">
            Transcode
          </div>
        </div>

        {/* Connecting Lines ABR -> Edge */}
        <div className="absolute left-[52%] right-[12%] h-full flex flex-col justify-center pointer-events-none">
           {nodes.map((_, i) => (
            <motion.div
              key={`line-2-${i}`}
              variants={{
                hidden: { pathLength: 0, opacity: 0 },
                visible: { pathLength: 1, opacity: 0.3, transition: { duration, delay: 2.0 + i * stagger } }
              }}
              className="absolute left-0 w-full border-t border-borderSubtle"
              style={{ top: `${20 + i * 15}%`, transformOrigin: "left center", rotate: `${(2 - i) * 8}deg` }}
            />
          ))}
        </div>

        {/* Step 3: Edge Nodes */}
        <div className="flex flex-col gap-6 md:gap-8 z-10">
          {nodes.map((_, i) => (
            <motion.div
              key={`node-${i}`}
              variants={{
                hidden: { opacity: 0, scale: 0.5 },
                visible: { opacity: 1, scale: 1, transition: { duration, delay: 2.0 + i * stagger } }
              }}
              className="relative flex items-center justify-center w-8 h-8 rounded-full border border-accent-mesh/30 bg-surface"
            >
              <div className="w-2 h-2 rounded-full bg-accent-mesh shadow-[0_0_10px_rgba(77,217,232,0.5)]" />
            </motion.div>
          ))}
          <div className="absolute bottom-4 right-0 font-mono text-[10px] text-text-muted uppercase tracking-wider text-center">
            Edge<br/>Delivery
          </div>
        </div>
      </motion.div>
    </div>
  );
}
