import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function StyleGuide() {
  return (
    <main className="p-8 max-w-5xl mx-auto space-y-16">
      <div>
        <h1 className="text-4xl font-display mb-4">MotionMesh Style Guide</h1>
        <p className="text-text-muted">A comprehensive overview of the design tokens and UI primitives.</p>
      </div>

      {/* Colors */}
      <section>
        <h2 className="text-2xl font-display mb-6 border-b border-borderSubtle pb-2">Colors</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ColorSwatch name="bg-base" color="bg-base" text="text-text-primary" />
          <ColorSwatch name="bg-surface" color="bg-surface" text="text-text-primary" />
          <ColorSwatch name="bg-surface-raised" color="bg-surface-raised" text="text-text-primary" />
          
          <ColorSwatch name="accent-motion" color="bg-accent-motion" text="text-base" />
          <ColorSwatch name="accent-mesh" color="bg-accent-mesh" text="text-base" />
          
          <ColorSwatch name="text-text-primary" color="bg-primary" text="text-base" />
          <ColorSwatch name="text-text-muted" color="bg-muted-foreground" text="text-base" />
          <ColorSwatch name="border-subtle" color="bg-border" text="text-text-primary" />
          
          <ColorSwatch name="success" color="bg-success" text="text-base" />
          <ColorSwatch name="warning" color="bg-warning" text="text-base" />
          <ColorSwatch name="danger" color="bg-danger" text="text-base" />
        </div>
      </section>

      {/* Typography */}
      <section>
        <h2 className="text-2xl font-display mb-6 border-b border-borderSubtle pb-2">Typography</h2>
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-display">Heading 1 (Space Grotesk)</h1>
            <p className="text-text-muted text-sm mt-1">Used for hero and section titles</p>
          </div>
          <div>
            <h2 className="text-3xl font-display">Heading 2 (Space Grotesk)</h2>
          </div>
          <div>
            <h3 className="text-2xl font-display">Heading 3 (Space Grotesk)</h3>
          </div>
          <div>
            <p className="text-base">Body (IBM Plex Sans) - The quick brown fox jumps over the lazy dog.</p>
            <p className="text-text-muted text-sm mt-1">Used for all UI text, labels, paragraphs</p>
          </div>
          <div>
            <p className="text-sm text-text-muted">Muted Text (IBM Plex Sans)</p>
          </div>
          <div>
            <code className="font-mono text-sm bg-surface-raised px-2 py-1 rounded">Code (IBM Plex Mono) - mot_live_1234567890</code>
            <p className="text-text-muted text-sm mt-1">Used for API keys, timecodes, bitrates, file sizes, code</p>
          </div>
        </div>
      </section>

      {/* Components */}
      <section>
        <h2 className="text-2xl font-display mb-6 border-b border-borderSubtle pb-2">Components</h2>
        
        <div className="space-y-12">
          {/* Buttons */}
          <div>
            <h3 className="text-xl font-display mb-4">Buttons</h3>
            <div className="flex flex-wrap gap-4 items-center">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="destructive">Danger</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </div>

          {/* Badges */}
          <div>
            <h3 className="text-xl font-display mb-4">Badges</h3>
            <div className="flex flex-wrap gap-4 items-center">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge className="bg-success text-base hover:bg-success/80">Success</Badge>
              <Badge className="bg-warning text-base hover:bg-warning/80">Warning</Badge>
            </div>
          </div>

          {/* Inputs */}
          <div>
            <h3 className="text-xl font-display mb-4">Inputs</h3>
            <div className="max-w-sm">
              <Input placeholder="Enter something..." />
            </div>
          </div>

          {/* Progress */}
          <div>
            <h3 className="text-xl font-display mb-4">Progress</h3>
            <div className="max-w-sm space-y-4">
              <Progress value={33} />
              <Progress value={66} className="bg-surface-raised [&>div]:bg-success" />
            </div>
          </div>

          {/* Skeleton */}
          <div>
            <h3 className="text-xl font-display mb-4">Skeleton</h3>
            <div className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            </div>
          </div>

          {/* Cards */}
          <div>
            <h3 className="text-xl font-display mb-4">Card</h3>
            <div className="max-w-md">
              <Card>
                <CardHeader>
                  <CardTitle>Bucket Status</CardTitle>
                  <CardDescription>View your storage metrics.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Storage used: 245 GB</p>
                </CardContent>
                <CardFooter>
                  <Button variant="outline">Manage</Button>
                </CardFooter>
              </Card>
            </div>
          </div>

          {/* Dialog */}
          <div>
            <h3 className="text-xl font-display mb-4">Dialog (Modal)</h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Are you absolutely sure?</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete your account
                    and remove your data from our servers.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost">Cancel</Button>
                  <Button variant="destructive">Continue</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
        </div>
      </section>
    </main>
  );
}

function ColorSwatch({ name, color, text }: { name: string, color: string, text: string }) {
  return (
    <div className="border border-borderSubtle rounded-lg overflow-hidden flex flex-col">
      <div className={`h-24 w-full ${color} flex items-center justify-center p-4`}>
        <span className={`text-sm font-mono ${text}`}>{color.replace('bg-', '')}</span>
      </div>
      <div className="p-3 bg-surface">
        <p className="text-sm font-medium">{name}</p>
      </div>
    </div>
  );
}
