"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserPlus, MoreHorizontal, Shield, Mail } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "developer" | "viewer";
  joinedAt: string;
  avatarInitials: string;
}

const getRoleColor = (role: string) => {
  switch (role) {
    case "owner":
      return "bg-warning/20 text-warning";
    case "admin":
      return "bg-info/20 text-info";
    case "developer":
      return "bg-surface-raised text-text-primary";
    default:
      return "bg-surface text-text-muted";
  }
};

export default function TeamPage() {
  const { user } = useUser();

  // Seed the list with the authenticated user as owner.
  const initialMembers: TeamMember[] = user
    ? [
        {
          id: user.id,
          name: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "You",
          email: user.primaryEmailAddress?.emailAddress ?? "",
          role: "owner",
          joinedAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
          avatarInitials: (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? ""),
        },
      ]
    : [];

  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get("email") as string;
    const role = formData.get("role") as "admin" | "developer" | "viewer";

    const newMember: TeamMember = {
      id: `usr_${Date.now()}`,
      name: "Pending Invite",
      email,
      role,
      joinedAt: new Date().toISOString(),
      avatarInitials: email.substring(0, 2).toUpperCase(),
    };

    setMembers((prev) => [...prev, newMember]);
    setIsInviteOpen(false);
    toast.success(`Invitation sent to ${email}`);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Team</h1>
          <p className="text-text-muted">Manage workspace access and roles.</p>
        </div>
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="w-4 h-4" /> Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Invite to Workspace</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-6 mt-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" name="email" type="email" placeholder="colleague@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select name="role" required defaultValue="viewer">
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-text-muted pt-1">
                  Admins have full access. Developers can manage resources. Viewers have read-only access.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Send Invite</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            People with access to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-borderSubtle overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface border-b border-borderSubtle">
                <tr>
                  <th className="px-4 py-3 font-medium text-text-muted">Member</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Role</th>
                  <th className="px-4 py-3 font-medium text-text-muted hidden sm:table-cell">Joined</th>
                  <th className="px-4 py-3 font-medium text-text-muted text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle bg-base">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-text-muted">
                      <Users className="w-8 h-8 mx-auto mb-3 text-text-muted/50" />
                      No members yet. Invite someone to get started.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id} className="hover:bg-surface-raised transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-surface to-surface-raised border border-borderSubtle flex items-center justify-center flex-shrink-0 text-xs font-semibold text-text-primary">
                            {member.avatarInitials || "?"}
                          </div>
                          <div>
                            <div className="font-medium text-text-primary">{member.name}</div>
                            <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" /> {member.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wider ${getRoleColor(member.role)}`}
                        >
                          {member.role === "owner" || member.role === "admin" ? (
                            <Shield className="w-3 h-3" />
                          ) : null}
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-text-muted hidden sm:table-cell font-mono text-xs">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-text-muted hover:text-text-primary"
                          disabled={member.role === "owner"}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
