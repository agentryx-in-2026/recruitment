import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Activity, Server, Cpu, HardDrive } from "lucide-react";

export function HealthDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/v1/admin/health"],
    refetchInterval: 5000 // refresh every 5 seconds
  });
  
  const health = data as any;

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-gov-blue" /></div>;
  }

  if (error) {
    return <div className="text-red-500 p-4">Failed to load system health</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-gov-green" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold uppercase text-gov-green">{health?.status}</div>
            <p className="text-xs text-muted-foreground mt-1">App Version: {health?.version}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Server className="h-4 w-4 text-gov-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.floor(health?.uptime / 3600)}h {Math.floor((health?.uptime % 3600) / 60)}m
            </div>
            <p className="text-xs text-muted-foreground mt-1">Since last restart</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <Cpu className="h-4 w-4 text-gov-orange" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health?.memory?.rss}</div>
            <p className="text-xs text-muted-foreground mt-1">Resident Set Size</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Heap Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-gov-amber" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health?.memory?.heapUsed} / {health?.memory?.heapTotal}</div>
            <p className="text-xs text-muted-foreground mt-1">V8 Engine Heap</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
