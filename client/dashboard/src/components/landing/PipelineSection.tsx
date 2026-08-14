export function PipelineSection() {
  const steps = [
    {
      num: "01",
      title: "Upload",
      desc: "Files land in S3-compatible object storage — usable standalone for any asset type.",
    },
    {
      num: "02",
      title: "Transcode",
      desc: "GPU-accelerated FFmpeg generating an optimized ABR ladder instantly.",
    },
    {
      num: "03",
      title: "Stream",
      desc: "Delivered directly via adaptive HLS or DASH streaming with minimal latency.",
    },
  ];

  return (
    <section className="py-24 border-t border-borderSubtle bg-base">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              {/* Connector line for desktop */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[80%] right-[-20%] h-px bg-borderSubtle" />
              )}
              
              <div className="font-mono text-5xl md:text-6xl text-surface-raised font-bold mb-6 select-none">
                {step.num}
              </div>
              <h3 className="font-display text-2xl font-semibold mb-3">{step.title}</h3>
              <p className="text-text-muted leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
