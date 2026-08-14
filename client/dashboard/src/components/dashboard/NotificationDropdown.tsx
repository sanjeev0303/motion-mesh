"use client";

import { useState } from "react";
import { Bell, Check, Zap, CreditCard } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
export function NotificationDropdown() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'job': return <Zap className="w-4 h-4 text-accent-motion" />;
      case 'billing': return <CreditCard className="w-4 h-4 text-success" />;
      default: return <Bell className="w-4 h-4 text-text-muted" />;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-raised rounded-md transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 flex items-center justify-center rounded-full bg-accent-motion border-2 border-base">
              {/* Optional: Add number for unreadCount if > 0 and size permits */}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 border-borderSubtle bg-base/95 backdrop-blur-md">
        <div className="flex items-center justify-between p-4 border-b border-borderSubtle">
          <h4 className="font-medium text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <button 
              onClick={handleMarkAllRead}
              className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors"
            >
              <Check className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-muted">
              No notifications yet.
            </div>
          ) : (
            <div className="divide-y divide-borderSubtle">
              {notifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className={`p-4 flex gap-3 transition-colors ${!notification.read ? 'bg-surface/50' : 'hover:bg-surface/30'}`}
                >
                  <div className={`mt-0.5 w-8 h-8 rounded-full border border-borderSubtle flex items-center justify-center flex-shrink-0 ${!notification.read ? 'bg-base' : 'bg-surface'}`}>
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className={`text-sm ${!notification.read ? 'font-medium text-text-primary' : 'text-text-muted'}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {notification.body}
                    </p>
                    <p className="text-[10px] font-mono text-text-muted pt-1">
                      {new Date(notification.timestamp).toLocaleString(undefined, { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      })}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="w-2 h-2 rounded-full bg-accent-motion mt-1.5 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
