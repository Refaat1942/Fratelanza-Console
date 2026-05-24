import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardSummary, useGetProfitByType, useGetPaymentAlerts, useGetRecentProjects } from '@workspace/api-client-react';
import { PrivacyWrapper } from '@/components/privacy-wrapper';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: profitByType, isLoading: loadingProfit } = useGetProfitByType();
  const { data: alerts, isLoading: loadingAlerts } = useGetPaymentAlerts();
  const { data: recentProjects, isLoading: loadingProjects } = useGetRecentProjects();

  const COLORS = ['hsl(195, 100%, 50%)', 'hsl(142, 71%, 45%)', 'hsl(43, 100%, 50%)', 'hsl(340, 82%, 52%)'];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {loadingSummary ? '...' : <PrivacyWrapper value={summary?.totalRevenue || 0} />}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {loadingSummary ? '...' : <PrivacyWrapper value={summary?.totalPaid || 0} />}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {loadingSummary ? '...' : <PrivacyWrapper value={summary?.totalRemaining || 0} />}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {loadingSummary ? '...' : <PrivacyWrapper value={summary?.totalNetProfit || 0} />}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {loadingSummary ? '...' : <PrivacyWrapper value={summary?.totalExpenses || 0} />}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle>Profit by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {!loadingProfit && profitByType && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profitByType}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="type" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Bar dataKey="netProfit" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle>Payment Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loadingAlerts ? (
                <div className="text-sm text-muted-foreground">Loading alerts...</div>
              ) : alerts?.length === 0 ? (
                <div className="text-sm text-muted-foreground">No pending alerts.</div>
              ) : (
                alerts?.map(alert => (
                  <div key={alert.id} className="flex justify-between items-center p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div>
                      <div className="font-medium text-sm">{alert.projectName}</div>
                      <div className="text-xs text-muted-foreground">{alert.clientName}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-destructive">
                        <PrivacyWrapper value={alert.remaining} />
                      </div>
                      <div className="text-xs text-muted-foreground">{alert.nextPaymentDate}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
