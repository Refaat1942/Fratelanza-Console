import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrivacyProvider } from "@/lib/privacy-context";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Layout } from "@/components/layout";
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

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/projects" component={Projects} />
        <Route path="/receivables" component={Receivables} />
        <Route path="/freelancers" component={Freelancers} />
        <Route path="/clients" component={Clients} />
        <Route path="/templates" component={Templates} />
        <Route path="/quotes" component={Quotes} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/finance" component={Finance} />
        <Route component={NotFound} />
      </Switch>
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
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
