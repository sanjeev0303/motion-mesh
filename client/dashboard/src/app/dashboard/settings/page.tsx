"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Save } from "lucide-react";

export default function SettingsPage() {
  const [accountName, setAccountName] = useState("Acme Corp");
  const [isSavingName, setIsSavingName] = useState(false);
  
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const handleSaveName = () => {
    setIsSavingName(true);
    setTimeout(() => {
      setIsSavingName(false);
      toast.success("Account name updated successfully.");
    }, 800);
  };

  const handleSavePreferences = () => {
    toast.success("Preferences saved successfully.");
  };

  const handleDeleteAccount = () => {
    if (deleteStep === 0) setDeleteStep(1);
    else if (deleteStep === 1 && deleteConfirmText === accountName) {
      setDeleteStep(2);
      toast.error("Account deletion initiated. You will be logged out.");
      // Redirect or logout simulation here
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Settings</h1>
          <p className="text-text-muted">Manage your workspace configuration and preferences.</p>
        </div>
      </div>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Workspace Profile</CardTitle>
            <CardDescription>General information about your workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 max-w-md">
              <Label htmlFor="name">Workspace Name</Label>
              <div className="flex gap-3">
                <Input 
                  id="name" 
                  value={accountName} 
                  onChange={(e) => setAccountName(e.target.value)} 
                />
                <Button onClick={handleSaveName} disabled={isSavingName} className="gap-2">
                  <Save className="w-4 h-4" /> Save
                </Button>
              </div>
            </div>
            
            <div className="grid gap-2 max-w-md pt-4">
              <Label htmlFor="region">Default Region</Label>
              <Select defaultValue="us-east-1">
                <SelectTrigger id="region">
                  <SelectValue placeholder="Select a region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                  <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                  <SelectItem value="eu-central-1">EU (Frankfurt)</SelectItem>
                  <SelectItem value="ap-northeast-1">Asia Pacific (Tokyo)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-text-muted mt-1">
                New buckets will be created in this region by default.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Manage your email notification preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Job Completion</Label>
                  <p className="text-sm text-text-muted">Receive an email when a video finishes processing.</p>
                </div>
                <input type="checkbox" defaultChecked className="rounded border-borderSubtle bg-base text-accent-motion focus:ring-accent-motion h-5 w-5" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Job Failures</Label>
                  <p className="text-sm text-text-muted">Receive an email when a video fails to process.</p>
                </div>
                <input type="checkbox" defaultChecked className="rounded border-borderSubtle bg-base text-accent-motion focus:ring-accent-motion h-5 w-5" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Billing & Invoices</Label>
                  <p className="text-sm text-text-muted">Receive monthly invoices and payment receipts.</p>
                </div>
                <input type="checkbox" defaultChecked className="rounded border-borderSubtle bg-base text-accent-motion focus:ring-accent-motion h-5 w-5" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-borderSubtle bg-surface/50 pt-6">
            <Button onClick={handleSavePreferences}>Save Preferences</Button>
          </CardFooter>
        </Card>

        <Card className="border-danger/30 bg-danger/5">
          <CardHeader>
            <CardTitle className="text-danger flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Danger Zone
            </CardTitle>
            <CardDescription>Irreversible and destructive actions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-danger/20 bg-base">
              <div>
                <h4 className="font-medium text-text-primary">Delete Workspace</h4>
                <p className="text-sm text-text-muted mt-1">
                  Permanently remove this workspace, all users, buckets, and videos. This action cannot be undone.
                </p>
              </div>
              
              {deleteStep === 0 ? (
                <Button variant="destructive" onClick={() => setDeleteStep(1)} className="flex-shrink-0">
                  Delete Workspace
                </Button>
              ) : (
                <div className="w-full sm:w-auto space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-danger">Type "{accountName}" to confirm</Label>
                    <Input 
                      value={deleteConfirmText} 
                      onChange={(e) => setDeleteConfirmText(e.target.value)} 
                      className="border-danger/50 focus-visible:ring-danger"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setDeleteStep(0); setDeleteConfirmText(""); }}>
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      disabled={deleteConfirmText !== accountName}
                      onClick={handleDeleteAccount}
                    >
                      Confirm Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
