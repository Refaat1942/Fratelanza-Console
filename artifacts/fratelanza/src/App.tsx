import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrivacyProvider } from "@/lib/privacy-context";
import { ThemeProvider } from "@/lib/theme-context";
import { BrandingProvider } from "@/lib/branding-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";

import Dashboard from "./pages/dashboard";
import Projects from "./pages/projects";
import Receivables from "./pages/receivables";
import Freelancers from "./pages/freelancers";
import Clients from "./pages/clients";
import Templates from "./pages/templates";
import Quotes from "./pages/quotes";
import Expenses from "./pages/expenses";
import Tasks from "./pages/tasks";
import Finance from "./pages/finance";
import Settings from "./pages/settings";
import Users from "./pages/users";

const queryClient = new QueryClient();

const PAGE_ORDER = ["dashboard","projects","receivables","freelancers","clients","templates","quotes","expenses","tasks","finance","settings"];
const PAGE_TO_PATH: Record<string,string> = {
  dashboard: "/", projects: "/projects", receivables: "/receivables", freelancers: "/freelancers",
  clients: "/clients", templates: "/templates", quotes: "/quotes", expenses: "/expenses",
  tasks: "/tasks", finance: "/finance", settings: "/settings",
};

function firstAllowedPath(canAccess: (k: string) => boolean, isAdmin: boolean): string | null {
  for (const k of PAGE_ORDER) {
    if (canAccess(k)) return PAGE_TO_PATH[k];
  }
  if (isAdmin) return "/users";
  return null;
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="text-2xl font-bold mb-2">No access</div>
      <div className="text-muted-foreground">Your account has no page permissions. Please contact an administrator.</div>
    </div>
  );
}

function Guard({ pageKey, adminOnly, children }: { pageKey?: string; adminOnly?: boolean; children: React.ReactNode }) {
  const { canAccess, isAdmin } = useAuth();
  const denied = (adminOnly && !isAdmin) || (pageKey && !canAccess(pageKey));
  if (denied) {
    const target = firstAllowedPath(canAccess, isAdmin);
    if (!target) return <NoAccess />;
    return <Redirect to={target} />;
  }
  return <>{children}</>;
}

function AnimatedRoutes() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition key={location}>
        <Switch location={location}>
          <Route path="/"><Guard pageKey="dashboard"><Dashboard /></Guard></Route>
          <Route path="/projects"><Guard pageKey="projects"><Projects /></Guard></Route>
          <Route path="/receivables"><Guard pageKey="receivables"><Receivables /></Guard></Route>
          <Route path="/freelancers"><Guard pageKey="freelancers"><Freelancers /></Guard></Route>
          <Route path="/clients"><Guard pageKey="clients"><Clients /></Guard></Route>
          <Route path="/templates"><Guard pageKey="templates"><Templates /></Guard></Route>
          <Route path="/quotes"><Guard pageKey="quotes"><Quotes /></Guard></Route>
          <Route path="/expenses"><Guard pageKey="expenses"><Expenses /></Guard></Route>
          <Route path="/tasks"><Guard pageKey="tasks"><Tasks /></Guard></Route>
          <Route path="/finance"><Guard pageKey="finance"><Finance /></Guard></Route>
          <Route path="/settings"><Guard pageKey="settings"><Settings /></Guard></Route>
          <Route path="/users"><Guard adminOnly><Users /></Guard></Route>
          <Route component={NotFound} />
        </Switch>
      </PageTransition>
    </AnimatePresence>
  );
}

function Router() {
  return (
    <Layout>
      <AnimatedRoutes />
    </Layout>
  );
}

function Gate() {
  const { state } = useAuth();
  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (state.status === "anon") return <Login />;
  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrandingProvider>
          <AuthProvider>
            <PrivacyProvider>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Gate />
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </PrivacyProvider>
          </AuthProvider>
        </BrandingProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
