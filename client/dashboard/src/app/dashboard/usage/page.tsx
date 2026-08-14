"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { Activity, CreditCard, HardDrive, Loader2, Zap, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";

interface Subscription {
  plan: string;
  status: string;
  storageUsedBytes?: number;
  egressUsedBytes?: number;
  transcodeMinutesUsed?: number;
  transcodeMinutesLimit?: number;
  prepaidBalance?: number;
}

interface UsageEvent {
  id: string;
  date: string;
  type: string;
  resource: string;
  quantity: string;
  cost: number;
}

export default function UsagePage() {
  const api = useApi();

  const { data: subscription, isLoading: subLoading } = useQuery<Subscription | null>({
    queryKey: ["billing", "subscription"],
    queryFn: async () => {
      const { data, response } = await api.GET("/v1/billing/subscription", {});
      if (!response.ok) return null;
      return (data as unknown as Subscription) ?? null;
    },
    staleTime: 60000,
  });

  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: async () => {
      const { data, response } = await api.GET("/v1/billing/invoices", {});
      if (!response.ok) return [];
      return (data as unknown as UsageEvent[]) ?? [];
    },
    staleTime: 60000,
  });

  const billing = {
    prepaidBalance: subscription?.prepaidBalance ?? 0,
    storageUsedBytes: subscription?.storageUsedBytes ?? 0,
    egressUsedBytes: subscription?.egressUsedBytes ?? 0,
    transcodeMinutesUsed: subscription?.transcodeMinutesUsed ?? 0,
    transcodeMinutesLimit: subscription?.transcodeMinutesLimit ?? 5000,
  };

  const events: UsageEvent[] = invoices ?? [];

  const isLoading = subLoading || invLoading;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-text-primary tracking-tight">Usage &amp; Billing</h1>
          <p className="text-text-muted mt-1">Monitor your resource consumption and billing details.</p>
        </div>
        <div className="flex items-center gap-4">
          {!subLoading && (
            <div className="text-right">
              <div className="text-sm text-text-muted">Prepaid Balance</div>
              <div className="text-xl font-bold text-text-primary">
                ${billing.prepaidBalance.toFixed(2)}
              </div>
            </div>
          )}
          <Button className="bg-bg-surface-raised text-text-primary border border-border-subtle hover:bg-bg-surface-raised/80">
            <CreditCard className="mr-2 h-4 w-4" />
            Add Funds
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-text-muted gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          Loading usage data…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-lg border border-border-subtle bg-bg-surface space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <HardDrive className="w-24 h-24" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-accent-motion/10 text-accent-motion rounded-md">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-medium text-text-primary">Storage</h3>
              </div>
              <UsageMeter
                label="Total Data Stored"
                used={billing.storageUsedBytes}
                limit={1024 * 1024 * 1024 * 1024 * 5}
                formatAs="bytes"
              />
              <p className="text-xs text-text-muted pt-2 border-t border-border-subtle">
                $0.023 per GB/month after limit
              </p>
            </div>

            <div className="p-6 rounded-lg border border-border-subtle bg-bg-surface space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Network className="w-24 h-24" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-accent-mesh/10 text-accent-mesh rounded-md">
                  <Network className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-medium text-text-primary">Egress</h3>
              </div>
              <UsageMeter
                label="Outbound Bandwidth"
                used={billing.egressUsedBytes}
                limit={1024 * 1024 * 1024 * 1024 * 10}
                formatAs="bytes"
              />
              <p className="text-xs text-text-muted pt-2 border-t border-border-subtle">
                $0.01 per GB after limit
              </p>
            </div>

            <div className="p-6 rounded-lg border border-border-subtle bg-bg-surface space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Zap className="w-24 h-24" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-warning/10 text-warning rounded-md">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-medium text-text-primary">Transcoding</h3>
              </div>
              <UsageMeter
                label="Compute Minutes"
                used={billing.transcodeMinutesUsed}
                limit={billing.transcodeMinutesLimit}
                formatAs="minutes"
              />
              <p className="text-xs text-text-muted pt-2 border-t border-border-subtle">
                $0.005 per min after limit
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-medium text-text-primary">Recent Usage Activity</h3>
                <p className="text-text-muted text-sm mt-0.5">
                  {events.length > 0
                    ? `Showing the last ${events.length} events this billing cycle.`
                    : "No events recorded this billing cycle."}
                </p>
              </div>
              <Button variant="ghost" className="text-text-muted hover:text-text-primary text-sm h-8">
                View full history
              </Button>
            </div>

            {events.length > 0 ? (
              <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
                <Table>
                  <TableHeader className="bg-bg-surface-raised">
                    <TableRow className="border-border-subtle hover:bg-transparent">
                      <TableHead className="text-text-muted font-medium w-[200px]">Date</TableHead>
                      <TableHead className="text-text-muted font-medium w-[150px]">Event Type</TableHead>
                      <TableHead className="text-text-muted font-medium">Resource</TableHead>
                      <TableHead className="text-text-muted font-medium text-right w-[150px]">Quantity</TableHead>
                      <TableHead className="text-text-muted font-medium text-right w-[120px]">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow
                        key={event.id}
                        className="border-border-subtle hover:bg-bg-surface-raised/50 transition-colors"
                      >
                        <TableCell className="text-text-muted text-sm">
                          {new Date(event.date).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Activity className="h-3 w-3 text-text-muted" />
                            <span className="font-medium text-text-primary">{event.type}</span>
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-text-muted">
                          {event.resource}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-text-primary">
                          {event.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-text-primary">
                          {event.cost > 0 ? (
                            `$${event.cost.toFixed(2)}`
                          ) : (
                            <span className="text-success text-xs bg-success/10 px-2 py-0.5 rounded">
                              Included
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center border border-border-subtle border-dashed rounded-lg bg-bg-surface">
                <Activity className="h-8 w-8 text-text-muted mb-3 opacity-50" />
                <p className="text-text-muted text-sm">No usage events recorded this billing cycle.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
