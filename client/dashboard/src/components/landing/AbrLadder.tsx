export function AbrLadder() {
  const ladder = [
    { res: "1080p", bitrate: "4500-6000 kbps", format: "H.264" },
    { res: "720p", bitrate: "2500-4000 kbps", format: "H.264" },
    { res: "480p", bitrate: "1000-2000 kbps", format: "H.264" },
    { res: "360p", bitrate: "600-1000 kbps", format: "H.264" },
    { res: "240p", bitrate: "300-500 kbps", format: "H.264" },
  ];

  return (
    <section className="py-24 border-t border-borderSubtle bg-surface">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center gap-16">
        <div className="md:w-1/2">
          <h2 className="text-3xl md:text-4xl font-display font-semibold mb-6">
            Adaptive Bitrate, built in.
          </h2>
          <p className="text-text-muted text-lg leading-relaxed mb-8">
            Stop stitching together generic transcode services. Every video is automatically 
            encoded into an optimal ABR ladder, ensuring smooth playback on a 4K TV or a 
            3G connection.
          </p>
        </div>
        
        <div className="md:w-1/2 w-full flex flex-col items-start px-4 md:px-0 relative">
          {/* Subtle grid background for the staircase */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#232838_1px,transparent_1px),linear-gradient(to_bottom,#232838_1px,transparent_1px)] bg-[size:1rem_1rem] opacity-30" />
          
          <div className="relative z-10 w-full">
            {ladder.map((tier, i) => (
              <div 
                key={tier.res} 
                className="flex items-center gap-4 mb-2"
                style={{ marginLeft: `${i * 10}%` }}
              >
                <div className="w-16 h-10 bg-surface-raised border border-borderSubtle flex items-center justify-center font-mono text-sm shadow-sm">
                  {tier.res}
                </div>
                <div className="hidden sm:flex font-mono text-xs text-text-muted items-center gap-4">
                  <span className="w-32">{tier.bitrate}</span>
                  <span className="px-2 py-1 bg-base border border-borderSubtle rounded-sm">{tier.format}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
