"use client";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { ArrowLeft, Trash2, Pencil, Save, X, Folder, File as FileIcon, ChevronRight, ChevronDown } from "lucide-react";
import { BucketIdPill } from "@/components/dashboard/BucketIdPill";
import Link from "next/link";
import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { API_URL, useApi } from "@/lib/api-client";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { formatBytes } from "@/lib/utils";
import { Bucket, BucketObject } from "@/lib/types";

export default function BucketDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const api = useApi();
  const { getToken } = useAuth();
  
  const { data: serverBuckets, isLoading: bucketsLoading } = useQuery({
    queryKey: ['buckets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/buckets', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        } as any,
        cache: 'no-store' as RequestCache,
      });
      if (error) {
        throw new Error("Failed to load buckets");
      }
      return (data as unknown as Bucket[]) ?? [];
    },
    staleTime: 60000,
  });

  const { data: objectsData, isLoading: objectsLoading } = useQuery({
    queryKey: ['buckets', params.id, 'objects'],
    queryFn: async () => {
      // Cast the fetch to any because openapi doesn't have this route yet
      const token = await getToken();
      const response = await fetch(`${API_URL}/v1/buckets/${params.id}/objects`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error("Failed to load objects");
      }
      const data = await response.json();
      return (data.objects as BucketObject[]) ?? [];
    },
    staleTime: 60000,
  });

  const buckets = serverBuckets ?? [];
  const initialBucket = buckets.find(b => b.id === params.id);
  
  const [editedName, setEditedName] = useState(initialBucket?.name || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [expandedPrefixes, setExpandedPrefixes] = useState<Set<string>>(new Set());

  const togglePrefix = (prefix: string) => {
    setExpandedPrefixes(prev => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
      }
      return next;
    });
  };

  // Group objects by prefix. 
  // Pattern 1: `videos/{videoID}/...` -> prefix is `videos/{videoID}/`
  // Pattern 2: Source files `{accountId}/videos/{filename}` -> prefix is `{accountId}/videos/` or we can just group by everything before the last slash.
  const groupedObjects = useMemo(() => {
    if (!objectsData) return {};
    
    const groups: Record<string, BucketObject[]> = {};
    for (const obj of objectsData) {
      // Extract prefix: everything before the last slash
      const lastSlashIdx = obj.key.lastIndexOf('/');
      const prefix = lastSlashIdx >= 0 ? obj.key.substring(0, lastSlashIdx + 1) : '/';
      
      if (!groups[prefix]) {
        groups[prefix] = [];
      }
      groups[prefix].push(obj);
    }
    return groups;
  }, [objectsData]);

  if (bucketsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-text-muted">Loading bucket details...</p>
      </div>
    );
  }

  const bucket = initialBucket;

  if (!bucket) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="h-14 w-14 rounded-full bg-bg-surface-raised border border-border-subtle flex items-center justify-center mb-5">
          <ArrowLeft className="h-7 w-7 text-text-muted" />
        </div>
        <h3 className="text-xl font-semibold text-text-primary mb-2">Bucket not found</h3>
        <p className="text-text-muted text-sm max-w-xs mb-6">
          This bucket doesn&apos;t exist or may have been deleted.
        </p>
        <Button variant="outline" asChild className="border-border-subtle text-text-muted hover:text-text-primary">
          <Link href="/dashboard/buckets">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Buckets
          </Link>
        </Button>
      </div>
    );
  }

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== bucket.name) {
      toast({
        title: "Bucket renamed",
        description: `Successfully renamed to ${editedName}`,
      });
    }
    setIsEditingName(false);
  };

  const handleDelete = () => {
    toast({
      title: "Bucket deleted",
      description: `${bucket.name} has been permanently deleted.`,
      variant: "destructive",
    });
    router.push("/dashboard/buckets");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center text-sm text-text-muted">
        <Link href="/dashboard/buckets" className="hover:text-text-primary flex items-center transition-colors">
          <ArrowLeft className="mr-1 h-3 w-3" />
          Back to Buckets
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input 
                value={editedName} 
                onChange={(e) => setEditedName(e.target.value)}
                className="text-2xl font-display font-bold bg-bg-surface border-border-subtle h-10 px-3 w-[300px]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
              />
              <Button size="icon" variant="ghost" onClick={handleSaveName} className="text-success hover:text-success hover:bg-success/10">
                <Save className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsEditingName(false)} className="text-text-muted">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-display font-bold text-text-primary tracking-tight">{bucket.name}</h1>
                <BucketIdPill bucketId={bucket.id} type="primary" />
              </div>
              <Button size="icon" variant="ghost" onClick={() => {
                setEditedName(bucket.name);
                setIsEditingName(true);
              }} className="text-text-muted hover:text-text-primary">
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Bucket
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-bg-surface border-border-subtle text-text-primary sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-display">Delete Bucket</DialogTitle>
              <DialogDescription className="text-text-muted">
                Are you sure you want to delete <span className="font-bold text-text-primary">{bucket.name}</span>? This action cannot be undone and will permanently delete all objects inside this bucket.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6">
              <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)} className="text-text-muted">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} className="bg-danger text-white hover:bg-danger/90">
                Yes, delete bucket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-lg border border-border-subtle bg-bg-surface space-y-6">
          <div>
            <h3 className="text-lg font-medium text-text-primary mb-1">Storage Usage</h3>
            <p className="text-sm text-text-muted mb-4">Total storage utilized by objects in this bucket.</p>
            <UsageMeter 
              label="Storage" 
              used={bucket.storageUsedBytes} 
              limit={bucket.storageLimitBytes} 
            />
          </div>
        </div>
        
        <div className="p-6 rounded-lg border border-border-subtle bg-bg-surface space-y-6">
          <div>
            <h3 className="text-lg font-medium text-text-primary mb-1">Egress Usage</h3>
            <p className="text-sm text-text-muted mb-4">Total data transferred out from this bucket this billing cycle.</p>
            <UsageMeter 
              label="Egress" 
              used={bucket.egressUsedBytes} 
              limit={bucket.egressLimitBytes} 
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-medium text-text-primary">Objects</h3>
          <span className="text-sm text-text-muted">{objectsData?.length || 0} objects total</span>
        </div>
        
        {objectsLoading ? (
          <div className="p-12 text-center border border-border-subtle border-dashed rounded-lg bg-bg-surface">
            <p className="text-text-muted">Loading objects...</p>
          </div>
        ) : Object.keys(groupedObjects).length > 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
            <Table>
              <TableHeader className="bg-bg-surface-raised">
                <TableRow className="border-border-subtle hover:bg-transparent">
                  <TableHead className="text-text-muted font-medium w-[400px]">Prefix / Object Key</TableHead>
                  <TableHead className="text-text-muted font-medium w-[150px]">Content Type</TableHead>
                  <TableHead className="text-text-muted font-medium text-right">Size</TableHead>
                  <TableHead className="text-text-muted font-medium text-right">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedObjects).map(([prefix, objs]) => {
                  const isExpanded = expandedPrefixes.has(prefix);
                  const totalSize = objs.reduce((sum, o) => sum + (o.sizeBytes || 0), 0);
                  const mostRecentDate = new Date(Math.max(...objs.map(o => new Date(o.uploadedAt).getTime())));
                  
                  return (
                    <React.Fragment key={prefix}>
                      <TableRow 
                        className="border-border-subtle hover:bg-bg-surface-raised/30 transition-colors cursor-pointer"
                        onClick={() => togglePrefix(prefix)}
                      >
                        <TableCell className="font-medium text-text-primary flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
                          <Folder className="h-4 w-4 text-accent-motion" />
                          <span className="truncate">{prefix}</span>
                          <span className="ml-2 text-xs text-text-muted bg-bg-surface-raised px-1.5 py-0.5 rounded-full">
                            {objs.length} files
                          </span>
                        </TableCell>
                        <TableCell className="text-text-muted">-</TableCell>
                        <TableCell className="text-text-muted text-right font-mono text-sm">{formatBytes(totalSize)}</TableCell>
                        <TableCell className="text-text-muted text-right text-sm">
                          {mostRecentDate.toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                      
                      {isExpanded && objs.map((obj) => (
                        <TableRow key={obj.id} className="border-border-subtle hover:bg-bg-surface-raised/50 transition-colors bg-bg-surface/50">
                          <TableCell className="font-medium text-text-primary flex items-center gap-2 pl-10">
                            <FileIcon className="h-4 w-4 text-text-muted" />
                            <span className="truncate text-sm">{obj.key.substring(prefix.length)}</span>
                          </TableCell>
                          <TableCell className="text-text-muted text-sm">{obj.contentType}</TableCell>
                          <TableCell className="text-text-muted text-right font-mono text-sm">{formatBytes(obj.sizeBytes || 0)}</TableCell>
                          <TableCell className="text-text-muted text-right text-sm">
                            {new Date(obj.uploadedAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-12 text-center border border-border-subtle border-dashed rounded-lg bg-bg-surface">
            <p className="text-text-muted">No objects found in this bucket.</p>
          </div>
        )}
      </div>
    </div>
  );
}

