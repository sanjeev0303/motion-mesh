"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { Bucket } from "@/lib/types";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useApi } from "@/lib/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function BucketsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [newBucketRegion, setNewBucketRegion] = useState("");
  const { toast } = useToast();
  const api = useApi();
  const queryClient = useQueryClient();

  const { data: serverBuckets, isError } = useQuery({
    queryKey: ['buckets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/buckets', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        } as any,
        cache: 'no-store' as RequestCache,
      });
      if (error) throw error;
      return (data as unknown as Bucket[]) ?? [];
    },
    staleTime: 60000,
  });

  const buckets = serverBuckets ?? [];
  const hasBuckets = buckets.length > 0;

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBucketName || !newBucketRegion) return;

    try {
      const { data, error } = await api.POST('/v1/buckets' as any, {
        body: { name: newBucketName, region: newBucketRegion } as any
      });
      if (error) throw error;

      queryClient.setQueryData(['buckets'], (oldData: Bucket[] | undefined) => [data as unknown as Bucket, ...(oldData || [])]);
      await queryClient.invalidateQueries({ queryKey: ['buckets'] });
      setIsCreateOpen(false);
      setNewBucketName("");
      setNewBucketRegion("");
      
      toast({
        title: "Bucket created",
        description: `${newBucketName} has been provisioned.`,
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Failed to create bucket",
        description: err.message || "An error occurred while creating the bucket.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-text-primary tracking-tight">Buckets</h1>
          <p className="text-text-muted mt-1">Manage your storage buckets and access policies.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent-motion text-bg-base hover:bg-accent-motion/90">
              <Plus className="mr-2 h-4 w-4" />
              Create Bucket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] border-borderSubtle bg-surface">
            <form onSubmit={handleCreateBucket}>
              <DialogHeader>
                <DialogTitle className="font-display">Create Storage Bucket</DialogTitle>
                <DialogDescription className="text-text-muted">
                  Provision a new object storage bucket for your media assets.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-6">
                <div className="grid gap-2">
                  <label htmlFor="name" className="text-sm font-medium">Bucket Name</label>
                  <Input 
                    id="name" 
                    value={newBucketName}
                    onChange={(e) => setNewBucketName(e.target.value)}
                    placeholder="e.g. production-media" 
                    className="bg-base border-borderSubtle focus-visible:ring-accent-motion"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="region" className="text-sm font-medium">Region</label>
                  <select 
                    id="region" 
                    value={newBucketRegion}
                    onChange={(e) => setNewBucketRegion(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-borderSubtle bg-base px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-motion disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="" disabled>Select a region</option>
                    <option value="ap-south-1">Asia Pacific (Mumbai)</option>
                    <option value="us-west-2">US West (Oregon)</option>
                    <option value="eu-central-1">EU (Frankfurt)</option>
                    <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!newBucketName || !newBucketRegion} className="bg-accent-motion text-bg-base hover:bg-accent-motion/90">
                  Provision Bucket
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-danger/20 border-dashed rounded-lg bg-danger/5">
          <h3 className="text-lg font-medium text-danger mb-2">Failed to load buckets</h3>
          <p className="text-text-muted max-w-sm mb-6">
            There was an error communicating with the server.
          </p>
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['buckets'] })}>
            Retry
          </Button>
        </div>
      ) : hasBuckets ? (
        <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
          <Table>
            <TableHeader className="bg-bg-surface-raised">
              <TableRow className="border-border-subtle hover:bg-transparent">
                <TableHead className="text-text-muted font-medium w-[250px]">Name</TableHead>
                <TableHead className="text-text-muted font-medium w-[120px]">Region</TableHead>
                <TableHead className="text-text-muted font-medium w-[100px] text-right">Objects</TableHead>
                <TableHead className="text-text-muted font-medium min-w-[200px]">Storage Used</TableHead>
                <TableHead className="text-text-muted font-medium min-w-[200px]">Egress Used</TableHead>
                <TableHead className="text-text-muted font-medium w-[150px] text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.map((bucket: Bucket) => (
                <TableRow key={bucket.id} className="border-border-subtle hover:bg-bg-surface-raised/50 group transition-colors">
                  <TableCell className="font-medium text-text-primary">
                    <Link href={`/dashboard/buckets/${bucket.id}`} className="hover:text-accent-motion transition-colors">
                      {bucket.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-text-muted font-mono text-sm">{bucket.region}</TableCell>
                  <TableCell className="text-text-muted text-right">{bucket.objectCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <UsageMeter 
                      label=""
                      used={bucket.storageUsedBytes} 
                      limit={bucket.storageLimitBytes} 
                    />
                  </TableCell>
                  <TableCell>
                    <UsageMeter 
                      label=""
                      used={bucket.egressUsedBytes} 
                      limit={bucket.egressLimitBytes} 
                    />
                  </TableCell>
                  <TableCell className="text-text-muted text-right text-sm">
                    {new Date(bucket.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-border-subtle border-dashed rounded-lg bg-bg-surface">
          <div className="h-12 w-12 rounded-full bg-bg-surface-raised flex items-center justify-center mb-4">
            <Plus className="h-6 w-6 text-text-muted" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No buckets yet</h3>
          <p className="text-text-muted max-w-sm mb-6">
            Create your first bucket to start uploading and transcoding videos.
          </p>
          <Button className="bg-accent-motion text-bg-base hover:bg-accent-motion/90" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Bucket
          </Button>
        </div>
      )}
    </div>
  );
}
