"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreditCard, Download, CheckCircle2, AlertCircle, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/lib/api-client";

export default function BillingPage() {
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [subscription, setSubscription] = useState<{ plan: string; status: string } | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const api = useApi();

  useEffect(() => {
    async function loadData() {
      try {
        const { data: sub, error: subErr, response: subRes } = await api.GET("/v1/billing/subscription", {
          cache: "no-store"
        });
        
        if (subErr || !subRes.ok) {
          if (subRes?.status === 401 || subRes?.status === 403) {
            toast.error("Unauthorized to view billing. Please log in.");
          } else if (subRes?.status === 429) {
            toast.error("Rate limited. Try again later.");
          } else {
            console.error("Failed to load subscription", subErr);
          }
        } else if (sub) {
          setSubscription(sub as any);
          if ((sub as any).balance !== undefined) {
            setBalance((sub as any).balance / 100);
          }
        }

        const { data: invs, error: invsErr, response: invsRes } = await api.GET("/v1/billing/invoices", {
          cache: "no-store"
        });
        if (invsErr || !invsRes.ok) {
          if (invsRes?.status === 401 || invsRes?.status === 403) {
             // Already handled by subscription above
          } else if (invsRes?.status === 429) {
             toast.error("Rate limited loading invoices.");
          } else {
             console.error("Failed to load invoices", invsErr);
          }
        } else if (invs) {
          setInvoices(invs as any);
        }
      } catch (err) {
        toast.error("Network error. Failed to load billing data.");
      }
    }
    loadData();
  }, [api]);

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const amount = parseFloat(formData.get("amount") as string);

    if (amount && amount > 0) {
      toast.info("Processing payment...");
      try {
        const { data, error, response } = await api.POST("/v1/billing/funds", {
          body: { amount: Math.round(amount * 100) }
        });

        if (error || !response.ok) {
          toast.error("Failed to add funds.");
          return;
        }

        if (data?.balance !== undefined) {
          setBalance(data.balance / 100);
        }
        setIsTopUpOpen(false);
        toast.success(`Successfully added $${amount.toFixed(2)} to your balance.`);
      } catch (err) {
        toast.error("An error occurred while processing payment.");
      }
    }
  };

  const handlePortalRedirect = async () => {
    try {
      toast.info("Redirecting to billing portal...");
      const { data, error, response } = await api.POST("/v1/billing/portal", {
        body: { return_url: window.location.href }
      });
      if (error || !response.ok) {
        toast.error("Failed to open billing portal.");
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      toast.error("An error occurred.");
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Billing</h1>
          <p className="text-text-muted">Manage your subscription and payments.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="relative overflow-hidden border-accent-motion/30 bg-gradient-to-br from-accent-motion/10 to-base shadow-lg shadow-accent-motion/5 group">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent-motion/20 rounded-full blur-3xl group-hover:bg-accent-motion/30 transition-colors duration-500" />
          <CardHeader className="relative z-10">
            <CardTitle className="text-xl flex items-center gap-2">Current Plan</CardTitle>
            <CardDescription>You are on the <span className="font-semibold text-accent-motion">{subscription?.plan || '...'}</span> tier.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 relative z-10">
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-muted">Prepaid Balance</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-display font-bold tracking-tight">${balance.toFixed(2)}</span>
              </div>
              <p className="text-xs text-text-muted mt-2">Usage is drawn from this balance.</p>
            </div>
            
            <div className="flex gap-3">
              <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
                <DialogTrigger asChild>
                  <Button className="flex-1 gap-2">
                    <ArrowUpRight className="w-4 h-4" /> Add Funds
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Add to Balance</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleTopUp} className="space-y-6 mt-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[25, 50, 100, 250, 500, 1000].map(amt => (
                        <Button 
                          key={amt} 
                          type="button" 
                          variant="outline" 
                          className="font-mono"
                          onClick={() => {
                            const input = document.getElementById('amount') as HTMLInputElement;
                            if (input) input.value = amt.toString();
                          }}
                        >
                          ${amt}
                        </Button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Input 
                        id="amount" 
                        name="amount" 
                        type="number" 
                        min="10" 
                        step="1" 
                        placeholder="Enter custom amount" 
                        required 
                        defaultValue="100"
                        className="text-text-primary bg-surface border-borderSubtle"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsTopUpOpen(false)}>Cancel</Button>
                      <Button type="submit">Process Payment</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
              <Button variant="outline" className="flex-1" onClick={handlePortalRedirect}>Change Plan</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-surface to-base hover:border-borderSubtle transition-all duration-300 group">
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent-mesh/10 rounded-full blur-3xl group-hover:bg-accent-mesh/20 transition-colors duration-500" />
          <CardHeader className="relative z-10">
            <CardTitle className="text-xl">Payment Method</CardTitle>
            <CardDescription>Primary card used for auto-recharge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-surface border border-borderSubtle">
              <div className="w-12 h-8 bg-base rounded border border-borderSubtle flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-text-muted" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">•••• •••• •••• 4242</p>
                <p className="text-xs text-text-muted">Expires 12/26</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-success/20 text-success">
                <CheckCircle2 className="w-3 h-3" /> Default
              </span>
            </div>
            <Button variant="outline" className="w-full" onClick={handlePortalRedirect}>Update Payment Method</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
          <CardDescription>Past billing statements and receipts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-borderSubtle overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface border-b border-borderSubtle">
                <tr>
                  <th className="px-4 py-3 font-medium text-text-muted">Date</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Amount</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Status</th>
                  <th className="px-4 py-3 font-medium text-text-muted text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle bg-base">
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-center text-text-muted">No invoices found.</td>
                  </tr>
                )}
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-raised transition-colors">
                    <td className="px-4 py-3 text-text-primary">
                      {new Date(inv.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">${inv.amount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium uppercase tracking-wider ${
                        inv.status === 'paid' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                      }`}>
                        {inv.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="gap-2 text-text-muted hover:text-text-primary" onClick={() => toast.success("Downloading invoice...")}>
                        <Download className="w-4 h-4" /> <span className="hidden sm:inline">PDF</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
