import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogViewer() {
  const [levelFilter, setLevelFilter] = useState<string>("all");
  
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["/api/v1/admin/logs"],
    refetchInterval: 10000 // auto-refresh 10s
  });

  const logs = (data as any)?.logs || [];
  
  const filteredLogs = logs.filter((log: any) => {
    if (levelFilter === "all") return true;
    return log?.level === levelFilter;
  });

  if (isLoading && !logs.length) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-gov-blue" /></div>;
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center space-x-2">
          <TerminalSquare className="h-5 w-5 text-gray-500" />
          <CardTitle>System Logs</CardTitle>
        </div>
        <div className="flex items-center space-x-4">
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Filter Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 m-4 border rounded bg-zinc-950 text-emerald-400 font-mono text-xs">
        <div className="h-full overflow-y-auto p-4 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500 italic">No logs found.</div>
          ) : (
            filteredLogs.map((log: any, i: number) => (
              <div key={i} className="flex">
                <span className="text-gray-500 min-w-[150px] whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className={`min-w-[60px] uppercase font-bold ${
                  log.level === 'error' ? 'text-red-400' :
                  log.level === 'warn' ? 'text-yellow-400' :
                  log.level === 'info' ? 'text-blue-400' : 'text-gray-400'
                }`}>
                  [{log.level}]
                </span>
                <span className="flex-1 break-all">
                  {log.message}
                  {log.meta && Object.keys(log.meta).length > 0 && (
                    <span className="text-gray-400 ml-2">
                      {JSON.stringify(log.meta)}
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
