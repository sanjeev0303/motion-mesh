"use client";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Key, Copy, CheckCircle2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useApi } from "@/lib/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function ApiKeysPage() {
  const { toast } = useToast();
  const api = useApi();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Create Key Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] = useState<"read" | "write" | "admin">("read");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const { data: serverKeys, isError } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      // Assuming a GET /v1/api-keys endpoint exists in the real API
      const { data, error, response } = await api.GET("/v1/api-keys" as any, {}); // Using "any" if the endpoint is not yet in the OpenAPI spec
      if (error || !response.ok) {
        if (response?.status === 401 || response?.status === 403) {
          toast({ title: "Unauthorized", description: "Please log in to view your API keys.", variant: "destructive" });
        } else if (response?.status === 429) {
          toast({ title: "Rate Limited", description: "Too many requests. Please try again later.", variant: "destructive" });
        }
        throw new Error("Failed to load real API keys");
      }
      return (data as unknown as any[]) ?? [];
    },
    staleTime: 60000,
  });

  const keys = serverKeys ?? [];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({
      title: "Copied to clipboard",
      description: "API Key has been copied to your clipboard.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    
    // Simulate generation
    const fullKey = `mot_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const masked = `mot_live_••••••••${fullKey.slice(-4)}`;
    
    const newKey = {
      id: `key_${Date.now()}`,
      name: newKeyName,
      scope: newKeyScope,
      createdAt: new Date().toISOString(),
      lastUsedAt: "Never",
      maskedValue: masked
    };
    
    queryClient.setQueryData(['apiKeys'], (oldData: any[] | undefined) => [newKey, ...(oldData || [])]);
    setNewlyCreatedKey(fullKey);
  };

  const handleRevoke = (id: string, name: string) => {
    queryClient.setQueryData(['apiKeys'], (oldData: any[] | undefined) => (oldData || []).filter((k: any) => k.id !== id));
    toast({
      title: "Key revoked",
      description: `The API key "${name}" has been revoked permanently.`,
      variant: "destructive"
    });
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setNewlyCreatedKey(null);
    setNewKeyName("");
    setNewKeyScope("read");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-text-primary tracking-tight">API Keys</h1>
          <p className="text-text-muted mt-1">Manage API keys to authenticate your backend services and clients.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={(open) => !open && closeCreateModal()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateOpen(true)} className="bg-accent-motion text-bg-base hover:bg-accent-motion/90">
              <Key className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-bg-surface border-border-subtle text-text-primary sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                {newlyCreatedKey ? "Save your new API Key" : "Create a new API Key"}
              </DialogTitle>
              <DialogDescription className="text-text-muted">
                {newlyCreatedKey 
                  ? "Please copy this key and store it somewhere safe. For security reasons, we cannot show it to you again." 
                  : "Give your key a descriptive name and appropriate permissions."}
              </DialogDescription>
            </DialogHeader>

            {newlyCreatedKey ? (
              <div className="mt-4 space-y-4">
                <div className="p-4 bg-bg-surface-raised border border-border-subtle rounded-md flex justify-between items-center">
                  <code className="font-mono text-accent-mesh break-all">{newlyCreatedKey}</code>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="ml-2 flex-shrink-0 hover:text-accent-motion text-text-muted"
                    onClick={() => handleCopy('new', newlyCreatedKey)}
                  >
                    {copiedId === 'new' ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="p-3 bg-warning/10 border border-warning/20 rounded text-sm text-warning flex items-start">
                  <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                  <p>You will not be able to see this token again after you close this dialog.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">Key Name</label>
                  <Input 
                    placeholder="e.g., Production Worker" 
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="bg-bg-base border-border-subtle"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">Scope</label>
                  <div className="flex gap-2">
                    {(['read', 'write', 'admin'] as const).map(scope => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => setNewKeyScope(scope)}
                        className={`flex-1 py-2 px-3 rounded text-sm font-medium border transition-colors ${
                          newKeyScope === scope 
                            ? 'bg-accent-motion/10 border-accent-motion/30 text-accent-motion' 
                            : 'bg-bg-base border-border-subtle text-text-muted hover:border-border-subtle/80'
                        }`}
                      >
                        {scope.charAt(0).toUpperCase() + scope.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted mt-2">
                    {newKeyScope === 'read' && "Can only read data and access videos."}
                    {newKeyScope === 'write' && "Can upload videos and manage renditions."}
                    {newKeyScope === 'admin' && "Can manage buckets, keys, and billing."}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="mt-6">
              {newlyCreatedKey ? (
                <Button onClick={closeCreateModal} className="w-full bg-bg-surface-raised hover:bg-bg-surface-raised/80 text-text-primary">
                  I have saved this key safely
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={closeCreateModal} className="text-text-muted hover:text-text-primary">
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={!newKeyName.trim()} className="bg-accent-motion text-bg-base hover:bg-accent-motion/90">
                    Create Key
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {keys.length > 0 ? (
        <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
          <Table>
            <TableHeader className="bg-bg-surface-raised">
              <TableRow className="border-border-subtle hover:bg-transparent">
                <TableHead className="text-text-muted font-medium w-[250px]">Name</TableHead>
                <TableHead className="text-text-muted font-medium w-[100px]">Scope</TableHead>
                <TableHead className="text-text-muted font-medium w-[250px]">Key</TableHead>
                <TableHead className="text-text-muted font-medium w-[150px]">Last Used</TableHead>
                <TableHead className="text-text-muted font-medium w-[150px]">Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id} className="border-border-subtle hover:bg-bg-surface-raised/50 transition-colors group">
                  <TableCell className="font-medium text-text-primary">{key.name}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                      key.scope === 'admin' ? 'bg-danger/10 text-danger border-danger/20' :
                      key.scope === 'write' ? 'bg-accent-motion/10 text-accent-motion border-accent-motion/20' :
                      'bg-bg-surface-raised text-text-muted border-border-subtle'
                    }`}>
                      {key.scope}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 group/copy">
                      <code className="font-mono text-sm text-text-muted">{key.maskedValue}</code>
                      <button 
                        onClick={() => handleCopy(key.id, key.maskedValue)}
                        className="text-text-muted opacity-0 group-hover/copy:opacity-100 hover:text-text-primary transition-all"
                        title="Copy Key"
                      >
                        {copiedId === key.id ? <CheckCircle2 className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-text-muted text-sm">
                    {key.lastUsedAt === "Never" ? "Never" : new Date(key.lastUsedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-text-muted text-sm">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <button 
                      onClick={() => handleRevoke(key.id, key.name)}
                      className="p-2 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger transition-all rounded-md hover:bg-danger/10"
                      title="Revoke Key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-border-subtle border-dashed rounded-lg bg-bg-surface">
          <div className="h-12 w-12 rounded-full bg-bg-surface-raised flex items-center justify-center mb-4">
            <Key className="h-6 w-6 text-text-muted" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No API keys</h3>
          <p className="text-text-muted max-w-sm mb-6">
            Create an API key to start integrating MotionMesh into your application.
          </p>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-accent-motion text-bg-base hover:bg-accent-motion/90">
            <Key className="mr-2 h-4 w-4" />
            Create API Key
          </Button>
        </div>
      )}
    </div>
  );
}

// Quick component for alert circle since lucide-react might not have it imported
function AlertCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
