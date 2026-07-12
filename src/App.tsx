import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode, type ErrorInfo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { GlobalBellRunner } from "@/lib/global-bell-runner";

import Dashboard from "@/pages/dashboard";
import Schedules from "@/pages/schedules";
import ScheduleDetail from "@/pages/schedule-detail";
import AutoSetup from "@/pages/auto-setup";
import ManualSetup from "@/pages/manual-setup";
import Settings from "@/pages/settings";
import Subjects from "@/pages/subjects";
import BellSettings from "@/pages/bell-settings";
import UserGuide from "@/pages/user-guide";
import BellSettingsAlert from "@/pages/bell-settings-alert";
import PeriodAlertPicker from "@/pages/period-alert-picker";
import DutyAlert from "@/pages/duty-alert";
import SpecialDuty from "@/pages/special-duty";
import SpecialTasks from "@/pages/special-tasks";
import NotFound from "@/pages/not-found";

// ── Per-route error boundary ──────────────────────────────────────────────────
// Isolates page crashes so one broken page never white-screens the entire app.
class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; stack: string | null }
> {
  state: { error: Error | null; stack: string | null } = { error: null, stack: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack?.slice(0, 600) ?? "";
    this.setState({ stack });
    console.error("[BellCraft] Page error:", error.message);
    console.error(stack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          dir="rtl"
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            marginTop: 40,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", textAlign: "center" }}>
            حدث خطأ في هذه الصفحة
          </p>
          <p
            style={{
              fontSize: 11,
              color: "#64748b",
              textAlign: "center",
              maxWidth: 300,
              wordBreak: "break-word",
              direction: "ltr",
            }}
          >
            {String(this.state.error)}
          </p>
          {this.state.stack && (
            <p
              style={{
                fontSize: 9,
                color: "#94a3b8",
                textAlign: "left",
                maxWidth: 320,
                wordBreak: "break-word",
                direction: "ltr",
                whiteSpace: "pre-wrap",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "6px 8px",
              }}
            >
              {this.state.stack.slice(0, 500)}
            </p>
          )}
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 8,
              padding: "10px 28px",
              borderRadius: 12,
              backgroundColor: "#1d4ed8",
              color: "white",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Layout>
      <RouteErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/schedules" component={Schedules} />
          <Route path="/schedules/:id/auto" component={AutoSetup} />
          <Route path="/schedules/:id/manual" component={ManualSetup} />
          <Route path="/schedules/:id" component={ScheduleDetail} />
          <Route path="/settings" component={Settings} />
          <Route path="/subjects" component={Subjects} />
          <Route path="/bell-settings/pre-start/periods" component={PeriodAlertPicker} />
          <Route path="/bell-settings/pre-start" component={() => <BellSettingsAlert alertType="pre-start" />} />
          <Route path="/bell-settings/pre-end" component={() => <BellSettingsAlert alertType="pre-end" />} />
          <Route path="/bell-settings/end" component={() => <BellSettingsAlert alertType="end" />} />
          <Route path="/bell-settings/duty" component={DutyAlert} />
          <Route path="/bell-settings/special-duty" component={SpecialDuty} />
          <Route path="/bell-settings/special-tasks" component={SpecialTasks} />
          <Route path="/bell-settings" component={BellSettings} />
          <Route path="/user-guide" component={UserGuide} />
          <Route component={NotFound} />
        </Switch>
      </RouteErrorBoundary>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <GlobalBellRunner>
            <Router />
          </GlobalBellRunner>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
