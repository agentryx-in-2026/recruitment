import { Application } from "@shared/schema";
import { mockJobs } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Send } from "lucide-react";

interface ApplicationStatusProps {
  application: Application;
}

export function ApplicationStatus({ application }: ApplicationStatusProps) {
  const job = mockJobs.find(j => j.id === application.jobId);
  if (!job) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "interview": return <CheckCircle className="w-4 h-4" />;
      case "review": return <Clock className="w-4 h-4" />;
      case "submitted": return <Send className="w-4 h-4" />;
      default: return <Send className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "interview": return "bg-gov-green text-white";
      case "review": return "bg-gov-amber text-white";
      case "submitted": return "bg-gov-blue text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "interview": return "Interview";
      case "review": return "Review";
      case "submitted": return "Submitted";
      default: return "Unknown";
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case "interview": return "Interview scheduled for March 15, 2024";
      case "review": return "Under review by recruitment team";
      case "submitted": return "Application submitted successfully";
      default: return "Status unknown";
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg" data-testid={`application-status-${application.id}`}>
      <div className="flex items-center space-x-4">
        <div className={`${getStatusColor(application.status || "submitted")} p-2 rounded-lg`} data-testid={`application-status-icon-${application.id}`}>
          {getStatusIcon(application.status || "submitted")}
        </div>
        <div>
          <h4 className="font-semibold text-gray-900" data-testid={`application-job-title-${application.id}`}>
            {job.title} - {job.company}
          </h4>
          <p className="text-gray-600 text-sm" data-testid={`application-status-message-${application.id}`}>
            {getStatusMessage(application.status || "submitted")}
          </p>
        </div>
      </div>
      <Badge className={getStatusColor(application.status || "submitted")} data-testid={`application-status-badge-${application.id}`}>
        {getStatusText(application.status || "submitted")}
      </Badge>
    </div>
  );
}
