import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-borderSubtle bg-base">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-6 h-6 rounded bg-gradient-to-tr from-accent-motion to-accent-mesh flex items-center justify-center opacity-80">
                <div className="w-3 h-3 bg-base rounded-sm" />
              </div>
              <span className="font-display font-semibold tracking-tight text-lg">Motionmesh</span>
            </div>
            <p className="text-sm text-text-muted">
              Developer-controlled video infrastructure. Store once, transcode once, stream everywhere.
            </p>
          </div>
          <div>
            <h3 className="font-display font-semibold mb-4">Product</h3>
            <ul className="space-y-3 text-sm text-text-muted">
              <li><Link href="#" className="hover:text-text-primary transition-colors">Object Storage</Link></li>
              <li><Link href="#" className="hover:text-text-primary transition-colors">Media Convert</Link></li>
              <li><Link href="#" className="hover:text-text-primary transition-colors">AI Captions</Link></li>
              <li><Link href="#pricing" className="hover:text-text-primary transition-colors">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-display font-semibold mb-4">Developers</h3>
            <ul className="space-y-3 text-sm text-text-muted">
              <li><Link href="#" className="hover:text-text-primary transition-colors">Documentation</Link></li>
              <li><Link href="#" className="hover:text-text-primary transition-colors">API Reference</Link></li>
              <li><Link href="#" className="hover:text-text-primary transition-colors">GitHub</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-display font-semibold mb-4">System</h3>
            <ul className="space-y-3 text-sm text-text-muted">
              <li>
                <Link href="#" className="hover:text-text-primary transition-colors flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success"></span>
                  All systems operational
                </Link>
              </li>
              <li><Link href="#" className="hover:text-text-primary transition-colors">System Status</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-borderSubtle flex flex-col md:flex-row items-center justify-between text-sm text-text-muted">
          <p>© {new Date().getFullYear()} Motionmesh. Not a real product.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <Link href="#" className="hover:text-text-primary transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-text-primary transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
