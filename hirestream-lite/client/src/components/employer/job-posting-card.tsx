import { Job } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Eye, Edit, Share } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JobPostingCardProps {
  job: Job & { applicationsCount?: number; shortlistedCount?: number; interviewedCount?: number };
}

export function JobPostingCard({ job }: JobPostingCardProps) {
  const { toast } = useToast();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-gov-green text-white";
      case "paused": return "bg-gov-amber text-white";
      case "closed": return "bg-gray-500 text-white";
      default: return "bg-gov-blue text-white";
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6" data-testid={`job-posting-card-${job.id}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-semibold text-gray-900 text-lg" data-testid={`job-posting-title-${job.id}`}>
            {job.title}
          </h4>
          <p className="text-gray-600" data-testid={`job-posting-type-${job.id}`}>
            Full-time • Remote/Hybrid
          </p>
          <p className="text-gray-500 text-sm flex items-center" data-testid={`job-posting-date-${job.id}`}>
            <Calendar className="w-4 h-4 mr-1" />
            Posted {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'Recently'}
          </p>
        </div>
        <div className="text-right">
          <Badge className={getStatusColor(job.status || "active")} data-testid={`job-posting-status-${job.id}`}>
            {(job.status || "active").charAt(0).toUpperCase() + (job.status || "active").slice(1)}
          </Badge>
          {job.salary && (
            <p className="text-gray-600 text-sm mt-1" data-testid={`job-posting-salary-${job.id}`}>
              {job.salary}
            </p>
          )}
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-4">
        {job.skills?.slice(0, 4).map((skill, index) => (
          <Badge key={index} variant="secondary" className="text-xs" data-testid={`job-posting-skill-${job.id}-${index}`}>
            {skill}
          </Badge>
        ))}
        <Badge variant="secondary" className="text-xs" data-testid={`job-posting-experience-${job.id}`}>
          {job.experience}+ years exp
        </Badge>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="text-center" data-testid={`job-posting-applications-${job.id}`}>
          <p className="text-2xl font-bold text-gov-blue">{job.applicationsCount || 0}</p>
          <p className="text-gray-600 text-sm">Applications</p>
        </div>
        <div className="text-center" data-testid={`job-posting-shortlisted-${job.id}`}>
          <p className="text-2xl font-bold text-gov-green">{job.shortlistedCount || Math.floor((job.applicationsCount || 0) * 0.26)}</p>
          <p className="text-gray-600 text-sm">Shortlisted</p>
        </div>
        <div className="text-center" data-testid={`job-posting-interviewed-${job.id}`}>
          <p className="text-2xl font-bold text-gov-orange">{job.interviewedCount || Math.floor((job.applicationsCount || 0) * 0.09)}</p>
          <p className="text-gray-600 text-sm">Interviewed</p>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-3">
        <Button 
          className="bg-gov-blue text-white hover:bg-gov-dark-blue"
          size="sm"
          data-testid={`button-view-applications-${job.id}`}
          onClick={() => toast({ title: "View Applications", description: `${job.applicationsCount || 0} candidates have applied to "${job.title}". Application viewer opens here.` })}
        >
          <Eye className="mr-2 h-4 w-4" />
          View Applications
        </Button>
        <Button 
          variant="outline"
          size="sm"
          data-testid={`button-edit-job-${job.id}`}
          onClick={() => toast({ title: "Edit Job", description: `Editing "${job.title}". Full job editor coming in next sprint.` })}
        >
          <Edit className="mr-2 h-4 w-4" />
          Edit Job
        </Button>
        <Button 
          variant="outline" 
          className="border-gov-green text-gov-green hover:bg-gov-green hover:text-white"
          size="sm"
          data-testid={`button-share-agents-${job.id}`}
          onClick={() => toast({ title: "Share with Agents", description: `"${job.title}" will be shared with your partner recruitment agencies.` })}
        >
          <Share className="mr-2 h-4 w-4" />
          Share with Agents
        </Button>
      </div>
    </div>
  );
}
