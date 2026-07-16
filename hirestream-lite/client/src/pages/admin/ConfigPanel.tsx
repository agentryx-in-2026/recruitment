import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Shield, Webhook, Loader2 } from "lucide-react";

export function ConfigPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/config"]
  });
  
  const config = data as any;

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-gov-blue" /></div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-gray-500" />
            <CardTitle>Environment Settings</CardTitle>
          </div>
          <CardDescription>Core runtime configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Environment</Label>
              <p className="text-sm text-gray-500">{config?.environment || 'unknown'}</p>
            </div>
            <div className="px-2 py-1 bg-gray-100 rounded text-sm font-mono border">
              NODE_ENV
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Log Level</Label>
              <p className="text-sm text-gray-500">Current verbosity: {config?.logLevel || 'info'}</p>
            </div>
            <div className="px-2 py-1 bg-gray-100 rounded text-sm font-mono border">
              LOG_LEVEL
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-gray-500" />
            <CardTitle>Security Secrets</CardTitle>
          </div>
          <CardDescription>Presence of required environment secrets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">Database Connection <Webhook className="w-4 h-4 text-emerald-500" /></Label>
              <p className="text-sm text-gray-500">{config?.hasDatabase ? 'Available' : 'Missing'}</p>
            </div>
            <Switch checked={config?.hasDatabase} disabled />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">Session Secret</Label>
              <p className="text-sm text-gray-500">{config?.hasSessionSecret ? 'Configured secure' : 'Default/Missing'}</p>
            </div>
            <Switch checked={config?.hasSessionSecret} disabled />
          </div>
        </CardContent>
      </Card>
      
      {/* Example for future extensible config controls like Maintenance Mode */}
      <Card className="md:col-span-2 border-dashed bg-gray-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-semibold text-gray-900">Maintenance Mode</h4>
              <p className="text-sm text-gray-500">Temporarily block all non-admin logins</p>
            </div>
            <Switch disabled />
          </div>
          <p className="text-xs text-gray-400 mt-2 italic">Requires Redis dynamic configuration module (Pending Phase 2)</p>
        </CardContent>
      </Card>
    </div>
  );
}
