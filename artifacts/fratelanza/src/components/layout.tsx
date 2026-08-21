import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Briefcase, DollarSign, Users, Building2, FileText, FileEdit,
  Receipt, KanbanSquare, PieChart, Lock, Unlock, LogOut, Menu, Sun, Moon,
  KeyRound, Settings as SettingsIcon, Languages, UserCog,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { usePrivacy } from '@/lib/privacy-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { useBranding } from '@/lib/branding-context';
import { setLanguage } from '@/lib/i18n';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CONSOLE_VERSION } from '@/lib/console-version';

function NavBody({ onNav }: { onNav?: () => void }) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { isAdmin, canAccess } = useAuth();
  const allNav = [
    { name: t('nav.dashboard'), href: '/', icon: LayoutDashboard, key: 'dashboard' },
    { name: t('nav.projects'), href: '/projects', icon: Briefcase, key: 'projects' },
    { name: t('nav.receivables'), href: '/receivables', icon: DollarSign, key: 'receivables' },
    { name: t('nav.freelancers'), href: '/freelancers', icon: Users, key: 'freelancers' },
    { name: t('nav.clients'), href: '/clients', icon: Building2, key: 'clients' },
    { name: t('nav.templates'), href: '/templates', icon: FileText, key: 'templates' },
    { name: t('nav.quotes'), href: '/quotes', icon: FileEdit, key: 'quotes' },
    { name: t('nav.expenses'), href: '/expenses', icon: Receipt, key: 'expenses' },
    { name: t('nav.tasks'), href: '/tasks', icon: KanbanSquare, key: 'tasks' },
    { name: t('nav.finance'), href: '/finance', icon: PieChart, key: 'finance' },
    { name: t('nav.settings'), href: '/settings', icon: SettingsIcon, key: 'settings' },
    { name: t('nav.users', { defaultValue: 'Users' }), href: '/users', icon: UserCog, key: 'users', adminOnly: true },
  ];
  const navigation = allNav.filter((it) => (it.adminOnly ? isAdmin : canAccess(it.key)));
  return (
    <nav className="space-y-1 px-3">
      {navigation.map((item, idx) => {
        const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
        return (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.03 }}
          >
            <Link
              href={item.href}
              onClick={onNav}
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all relative ${
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid={`nav-${item.key}`}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active-indicator"
                  className="absolute inset-y-1 left-0 w-1 rounded-r bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon className={`me-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              {item.name}
            </Link>
          </motion.div>
        );
      })}
    </nav>
  );
}

function LanguageToggle() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <button
      onClick={() => setLanguage(isAr ? 'en' : 'ar')}
      className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      data-testid="button-toggle-language"
    >
      <Languages className="me-3 h-5 w-5" />
      {isAr ? 'English' : 'العربية'}
    </button>
  );
}

function PrivacyControls() {
  const { t } = useTranslation();
  const { isPrivate, enablePrivacy, disablePrivacy, setPrivacyPassword } = usePrivacy();
  const { toast } = useToast();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPwd, setUnlockPwd] = useState('');
  const [changeOpen, setChangeOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const handleUnlock = () => {
    if (disablePrivacy(unlockPwd)) {
      toast({ title: t('privacy.unlocked') });
      setUnlockOpen(false);
      setUnlockPwd('');
    } else {
      toast({ title: t('privacy.incorrect'), variant: 'destructive' });
    }
  };

  const handleChange = () => {
    if (setPrivacyPassword(oldPwd, newPwd)) {
      toast({ title: t('privacy.updated') });
      setChangeOpen(false);
      setOldPwd(''); setNewPwd('');
    } else {
      toast({ title: t('privacy.couldNotUpdate'), variant: 'destructive' });
    }
  };

  return (
    <>
      <button
        onClick={() => (isPrivate ? setUnlockOpen(true) : enablePrivacy())}
        className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        data-testid="button-toggle-privacy"
      >
        {isPrivate ? <><Lock className="me-3 h-5 w-5" /> {t('privacy.on')}</> : <><Unlock className="me-3 h-5 w-5" /> {t('privacy.off')}</>}
      </button>
      <button
        onClick={() => setChangeOpen(true)}
        className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        data-testid="button-change-privacy-pwd"
      >
        <KeyRound className="me-3 h-5 w-5" /> {t('privacy.changePassword')}
      </button>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('privacy.enterPassword')}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>{t('common.password' as any, { defaultValue: 'Password' })}</Label>
            <Input type="password" autoFocus value={unlockPwd} onChange={(e) => setUnlockPwd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleUnlock()} data-testid="input-privacy-password" />
            <p className="text-xs text-muted-foreground">{t('privacy.defaultHint')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleUnlock} data-testid="button-unlock-privacy">{t('privacy.unlock')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('privacy.changePassword')}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>{t('privacy.currentPassword')}</Label><Input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('privacy.newPassword')}</Label><Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleChange}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BrandHeader() {
  const { brandName, tagline, logoDataUrl } = useBranding();
  return (
    <div className="h-16 flex items-center px-6 border-b border-border gap-3">
      {logoDataUrl ? (
        <img src={logoDataUrl} alt={brandName} className="h-9 w-9 rounded object-cover" />
      ) : (
        <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center text-primary font-bold">
          {brandName.charAt(0)}
        </div>
      )}
      <div className="min-w-0">
        <div className="font-bold text-sm tracking-tight text-primary truncate">{brandName}</div>
        {tagline && <div className="text-[10px] text-muted-foreground truncate">{tagline}</div>}
      </div>
    </div>
  );
}

function SidebarContent({ onNav }: { onNav?: () => void } = {}) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  return (
    <>
      <BrandHeader />
      <div className="flex-1 overflow-y-auto py-4">
        <NavBody onNav={onNav} />
      </div>
      <div className="p-4 border-t border-border space-y-1">
        <PrivacyControls />
        <LanguageToggle />
        <button
          onClick={toggleTheme}
          className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          data-testid="button-toggle-theme"
        >
          {theme === 'dark' ? <><Sun className="me-3 h-5 w-5" /> {t('theme.light')}</> : <><Moon className="me-3 h-5 w-5" /> {t('theme.dark')}</>}
        </button>
        <button
          onClick={logout}
          className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="me-3 h-5 w-5" /> {t('nav.logout')}
        </button>
        <div className="px-3 pt-2 text-[10px] text-muted-foreground/60 text-center" data-testid="console-version">
          v{CONSOLE_VERSION}
        </div>
      </div>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const { state } = useAuth();
  const username = state.status === 'auth' ? state.username : '';
  const [mobileOpen, setMobileOpen] = useState(false);
  const isRtl = i18n.language === 'ar';

  const titleKey = location === '/' ? 'dashboard'
    : location.startsWith('/projects') ? 'projects'
    : location.startsWith('/receivables') ? 'receivables'
    : location.startsWith('/freelancers') ? 'freelancers'
    : location.startsWith('/clients') ? 'clients'
    : location.startsWith('/templates') ? 'templates'
    : location.startsWith('/quotes') ? 'quotes'
    : location.startsWith('/expenses') ? 'expenses'
    : location.startsWith('/tasks') ? 'tasks'
    : location.startsWith('/finance') ? 'finance'
    : location.startsWith('/settings') ? 'settings'
    : 'dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground" dir={isRtl ? 'rtl' : 'ltr'}>
      <aside className={`hidden md:flex w-64 ${isRtl ? 'border-l' : 'border-r'} border-border bg-card flex-col`}>
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side={isRtl ? 'right' : 'left'} className="p-0 w-72 bg-card flex flex-col">
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
            <motion.h1
              key={titleKey}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="text-lg md:text-xl font-semibold"
            >
              {t(`nav.${titleKey}`)}
            </motion.h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            {username && <span className="hidden sm:inline text-sm text-muted-foreground">@{username}</span>}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="hidden sm:inline">{t('nav.systemActive')}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">{children}</main>
      </div>
    </div>
  );
}
