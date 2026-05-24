import React from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Briefcase,
  DollarSign,
  Users,
  Building2,
  FileText,
  FileEdit,
  Receipt,
  KanbanSquare,
  PieChart,
  Lock,
  Unlock,
  LogOut,
} from 'lucide-react';
import { usePrivacy } from '@/lib/privacy-context';
import { useAuth } from '@/lib/auth-context';

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isPrivate, togglePrivacy } = usePrivacy();
  const { state, logout } = useAuth();
  const username = state.status === 'auth' ? state.username : '';

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: Briefcase },
    { name: 'Receivables', href: '/receivables', icon: DollarSign },
    { name: 'Freelancers', href: '/freelancers', icon: Users },
    { name: 'Clients', href: '/clients', icon: Building2 },
    { name: 'Templates', href: '/templates', icon: FileText },
    { name: 'Quotes', href: '/quotes', icon: FileEdit },
    { name: 'Expenses', href: '/expenses', icon: Receipt },
    { name: 'Tasks', href: '/tasks', icon: KanbanSquare },
    { name: 'Finance', href: '/finance', icon: PieChart },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground dark">
      <div className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="font-bold text-lg tracking-tight text-primary">FRATELANZA</div>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-3">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  data-testid={`nav-${item.name.toLowerCase()}`}
                >
                  <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-border space-y-1">
          <button
            onClick={togglePrivacy}
            className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            data-testid="button-toggle-privacy"
          >
            {isPrivate ? (
              <><Lock className="mr-3 h-5 w-5" /> Privacy: ON</>
            ) : (
              <><Unlock className="mr-3 h-5 w-5" /> Privacy: OFF</>
            )}
          </button>
          <button
            onClick={logout}
            className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="mr-3 h-5 w-5" /> Logout
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-8">
          <h1 className="text-xl font-semibold capitalize">
            {location === '/' ? 'Dashboard' : location.split('/')[1].replace('-', ' ')}
          </h1>
          <div className="flex items-center gap-4">
            {username && <span className="text-sm text-muted-foreground">@{username}</span>}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500"></span>
              System Active
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 bg-background">{children}</main>
      </div>
    </div>
  );
}
