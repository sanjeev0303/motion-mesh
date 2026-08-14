export function FeaturesSection() {
  const features = [
    {
      category: "Object Storage",
      note: "S3-compatible storage for any file type — not only video. Use it as a standalone object store, or feed files directly into Media Convert.",
      items: [
        "S3-compatible API",
        "Multi-region replication",
        "Instant read-after-write",
        "No egress fees for transcode",
      ]
    },
    {
      category: "Media Convert",
      items: [
        "H.264 & H.265 (HEVC)",
        "Automatic ABR ladder generation",
        "Hardware-accelerated encoding",
        "VTT & WebVTT caption support",
      ]
    },
    {
      category: "AI Subtitles & Player",
      items: [
        "Auto-generated Whisper captions",
        "Chapter marker extraction",
        "Customizable HTML5 player",
        "Token-authenticated playback",
      ]
    }
  ];

  return (
    <section className="py-24 border-t border-borderSubtle bg-base">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-display font-semibold mb-16 text-center">
          Infrastructure, not apps.
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 border border-borderSubtle rounded-xl overflow-hidden bg-surface">
          {features.map((feature, i) => (
            <div 
              key={feature.category} 
              className={`p-8 ${i < features.length - 1 ? 'border-b md:border-b-0 md:border-r border-borderSubtle' : ''}`}
            >
              <h3 className="font-display text-xl font-semibold mb-2 text-accent-mesh">{feature.category}</h3>
              {feature.note && <p className="text-xs text-text-primary/80 mb-6">{feature.note}</p>}
              <ul className="space-y-4">
                {feature.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-borderSubtle mt-2 flex-shrink-0" />
                    <span className="text-text-muted">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
