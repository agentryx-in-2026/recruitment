import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, CheckCircle, Clock, XCircle, Star, Calendar, Briefcase } from "lucide-react";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: [] };
  return res.json();
}

const PIPELINE_STAGES = [
  { key: "submitted", label: "Submitted", icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-100", ring: "ring-blue-500" },
  { key: "reviewed", label: "Reviewed", icon: Clock, color: "text-amber-600", bg: "bg-amber-100", ring: "ring-amber-500" },
  { key: "shortlisted", label: "Shortlisted", icon: Star, color: "text-purple-600", bg: "bg-purple-100", ring: "ring-purple-500" },
  { key: "interview_scheduled", label: "Interview", icon: Calendar, color: "text-cyan-600", bg: "bg-cyan-100", ring: "ring-cyan-500" },
  { key: "selected", label: "Selected", icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-100", ring: "ring-emerald-500" },
  { key: "placed", label: "Placed", icon: Briefcase, color: "text-green-700", bg: "bg-green-100", ring: "ring-green-600" },
];

export function ApplicationTracker() {
  const { data: appsRes, isLoading } = useQuery({
    queryKey: ["/api/v1/candidates/applications"],
    queryFn: () => fetchJson("/api/v1/candidates/applications"),
  });

  const applications = appsRes?.data || [];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
      <h3 className="text-xl font-semibold text-gray-900 flex items-center mb-6">
        <ClipboardList className="text-blue-600 mr-2" />
        Application Tracker
        {applications.length > 0 && (
          <Badge variant="secondary" className="ml-2">{applications.length}</Badge>
        )}
      </h3>

      {applications.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No applications yet</p>
          <p className="text-sm mt-1">Browse the Job Discovery Board above and click "Apply Now" to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {applications.map((app: any) => (
            <ApplicationCard key={app.id} application={app} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationCard({ application }: { application: any }) {
  const currentStageIndex = PIPELINE_STAGES.findIndex(s => s.key === application.status);
  const isRejected = application.status === "rejected";

  return (
    <div className="border border-gray-200 rounded-lg p-5 hover:shadow-sm transition-shadow">
      {/* Job Info Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-semibold text-gray-900">{application.jobTitle || "Job"}</h4>
          <p className="text-sm text-gray-500">{application.company}{application.location ? ` — ${application.location}, ${application.country}` : ""}</p>
        </div>
        <div className="text-right">
          {application.matchScore > 0 && (
            <Badge className={`${application.matchScore >= 80 ? 'bg-emerald-600' : application.matchScore >= 60 ? 'bg-amber-500' : 'bg-gray-500'} text-white`}>
              {application.matchScore}% match
            </Badge>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Applied {application.appliedAt ? new Date(application.appliedAt).toLocaleDateString("en-IN") : ""}
          </p>
        </div>
      </div>

      {/* Pipeline Visualization */}
      {isRejected ? (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="w-5 h-5 text-red-500" />
          <span className="text-sm font-medium text-red-700">Application not selected this time</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {PIPELINE_STAGES.map((stage, index) => {
            const StageIcon = stage.icon;
            const isCompleted = index < currentStageIndex;
            const isCurrent = index === currentStageIndex;
            const isFuture = index > currentStageIndex;

            return (
              <div key={stage.key} className="flex items-center">
                <div className={`flex flex-col items-center min-w-[70px] ${isFuture ? 'opacity-40' : ''}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    isCompleted ? 'bg-emerald-100 text-emerald-600' :
                    isCurrent ? `${stage.bg} ${stage.color} ring-2 ${stage.ring}` :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : <StageIcon className="w-4 h-4" />}
                  </div>
                  <span className={`text-[10px] mt-1 font-medium text-center leading-tight ${
                    isCurrent ? stage.color : isCompleted ? 'text-emerald-600' : 'text-gray-400'
                  }`}>
                    {stage.label}
                  </span>
                </div>
                {index < PIPELINE_STAGES.length - 1 && (
                  <div className={`w-6 h-0.5 mx-0.5 ${index < currentStageIndex ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
