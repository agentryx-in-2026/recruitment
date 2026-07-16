import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Building, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";

interface Agency {
  id: string;
  userId: string;
  agencyName: string;
  licenseNumber: string;
  specializations: string[] | null;
  verified: boolean;
  rating: number;
  placements: number;
}

export function AgencyApprovalList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: agenciesResponse, isLoading, error } = useQuery({
    queryKey: ["/api/v1/admin/agencies"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/agencies");
      if (!res.ok) throw new Error("Failed to fetch agencies");
      return res.json();
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      const res = await fetch(`/api/v1/admin/agencies/${id}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });
      if (!res.ok) throw new Error("Failed to update agency");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/agencies"] });
      toast({
        title: vars.verified ? "Agency Approved" : "Agency Revoked",
        description: vars.verified
          ? "The agency can now post jobs on the platform."
          : "The agency's verification has been revoked.",
      });
    },
    onError: () => {
      toast({
        title: "Action Failed",
        description: "Could not update agency verification status.",
        variant: "destructive",
      });
    },
  });

  const agencies: Agency[] = (agenciesResponse as any)?.data || [];
  const pendingAgencies = agencies.filter((a) => !a.verified);
  const verifiedAgencies = agencies.filter((a) => a.verified);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-gov-blue" />
        <span className="ml-2 text-gray-500">Loading agencies...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-500">
        Failed to load agencies. Please refresh.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pending Verification */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center" data-testid="pending-agencies-title">
          <ShieldAlert className="text-gov-amber mr-2 w-5 h-5" />
          Pending HPSEDC Verification
          {pendingAgencies.length > 0 && (
            <Badge className="ml-2 bg-gov-amber text-white">{pendingAgencies.length}</Badge>
          )}
        </h3>

        {pendingAgencies.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>All agencies are verified. No pending approvals.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingAgencies.map((agency) => (
              <div
                key={agency.id}
                className="flex items-center justify-between p-4 border border-amber-200 bg-amber-50 rounded-lg"
                data-testid={`pending-agency-${agency.id}`}
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-gov-amber text-white p-2 rounded-lg">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{agency.agencyName}</h4>
                    <p className="text-sm text-gray-600">
                      License: <span className="font-mono">{agency.licenseNumber}</span>
                    </p>
                    {agency.specializations && agency.specializations.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {agency.specializations.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    className="bg-gov-green text-white hover:bg-green-700"
                    onClick={() => verifyMutation.mutate({ id: agency.id, verified: true })}
                    disabled={verifyMutation.isPending}
                    data-testid={`approve-${agency.id}`}
                  >
                    {verifyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verified Agencies */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center" data-testid="verified-agencies-title">
          <ShieldCheck className="text-gov-green mr-2 w-5 h-5" />
          Verified Agencies
          <Badge className="ml-2 bg-gov-green text-white">{verifiedAgencies.length}</Badge>
        </h3>

        {verifiedAgencies.length === 0 ? (
          <p className="text-center py-8 text-gray-400">No verified agencies yet.</p>
        ) : (
          <div className="space-y-3">
            {verifiedAgencies.map((agency) => (
              <div
                key={agency.id}
                className="flex items-center justify-between p-4 border border-green-200 bg-green-50 rounded-lg"
                data-testid={`verified-agency-${agency.id}`}
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-gov-green text-white p-2 rounded-lg">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{agency.agencyName}</h4>
                    <p className="text-sm text-gray-600">
                      License: <span className="font-mono">{agency.licenseNumber}</span>
                      {" • "}
                      Placements: {agency.placements}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => verifyMutation.mutate({ id: agency.id, verified: false })}
                  disabled={verifyMutation.isPending}
                  data-testid={`revoke-${agency.id}`}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
