import React, { useState } from 'react';
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
  Menu,
  Sun,
  Moon,
  KeyRound,
} from 'lucide-react';
import { usePrivacy } from '@/lib/privacy-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

function NavBody({ onNav }: { onNav?: () => void }) {
  const [location] = useLocation();
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
    <nav className="space-y-1 px-3">
      {navigation.map((item) => {
        const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNav}
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
  );
}

function PrivacyControls() {
  const { isPrivate, enablePrivacy, disablePrivacy, setPrivacyPassword } = usePrivacy();
  const { toast } = useToast();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPwd, setUnlockPwd] = useState('');
  const [changeOpen, setChangeOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const handleUnlock = () => {
    if (disablePrivacy(unlockPwd)) {
      toast({ title: 'Privacy unlocked' });
      setUnlockOpen(false);
      setUnlockPwd('');
    } else {
      toast({ title: 'Incorrect password', variant: 'destructive' });
    }
  };

  const handleChange = () => {
    if (setPrivacyPassword(oldPwd, newPwd)) {
      toast({ title: 'Password updated' });
      setChangeOpen(false);
      setOldPwd(''); setNewPwd('');
    } else {
      toast({ title: 'Could not update password', description: 'Check current password.', variant: 'destructive' });
    }
  };

  return (
    <>
      <button
        onClick={() => (isPrivate ? setUnlockOpen(true) : enablePrivacy())}
        className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        data-testid="button-toggle-privacy"
      >
        {isPrivate ? <><Lock className="mr-3 h-5 w-5" /> Privacy: ON</> : <><Unlock className="mr-3 h-5 w-5" /> Privacy: OFF</>}
      </button>
      <button
        onClick={() => setChangeOpen(true)}
        className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        data-testid="button-change-privacy-pwd"
      >
        <KeyRound className="mr-3 h-5 w-5" /> Change Privacy Password
      </button>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enter privacy password</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Password</Label>
            <Input type="password" autoFocus value={unlockPwd} onChange={(e) => setUnlockPwd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleUnlock()} data-testid="input-privacy-password" />
            <p className="text-xs text-muted-foreground">Default: <code>fratelanza</code></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockOpen(false)}>Cancel</Button>
            <Button onClick={handleUnlock} data-testid="button-unlock-privacy">Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change privacy password</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Current password</Label><Input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} /></div>
            <div className="space-y-1"><Label>New password</Label><Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeOpen(false)}>Cancel</Button>
            <Button onClick={handleChange}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SidebarContent({ onNav }: { onNav?: () => void } = {}) {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  return (
    <>
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="font-bold text-lg tracking-tight text-primary">FRATELANZA</div>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <NavBody onNav={onNav} />
      </div>
      <div className="p-4 border-t border-border space-y-1">
        <PrivacyControls />
        <button
          onClick={toggleTheme}
          className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          data-testid="button-toggle-theme"
        >
          {theme === 'dark' ? <><Sun className="mr-3 h-5 w-5" /> Light theme</> : <><Moon className="mr-3 h-5 w-5" /> Dark theme</>}
        </button>
        <button
          onClick={logout}
          className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="mr-3 h-5 w-5" /> Logout
        </button>
      </div>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { state } = useAuth();
  const username = state.status === 'auth' ? state.username : '';
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-card flex flex-col border-r border-border">
          <SidebarContent onNav={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-open-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            </Sheet>
            <h1 className="text-lg md:text-xl font-semibold capitalize">
              {location === '/' ? 'Dashboard' : location.split('/')[1].replace('-', ' ')}
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            {username && <span className="hidden sm:inline text-sm text-muted-foreground">@{username}</span>}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500"></span>
              <span className="hidden sm:inline">System Active</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">{children}</main>
      </div>
    </div>
  );
}
