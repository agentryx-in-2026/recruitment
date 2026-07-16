import { Job } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, Loader2, CheckCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface JobCardProps {
  job: Job & { matchScore?: number };
  applied?: boolean;
}

export function JobCard({ job, applied = false }: JobCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasApplied, setHasApplied] = useState(applied);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/jobs/${job.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to apply");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setHasApplied(true);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({
        title: "Application Submitted!",
        description: `Match score: ${data.data?.matchScore || "Calculating"}%. Good luck!`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Application Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const getMatchColor = (score?: number) => {
    if (!score) return "bg-gray-500";
    if (score >= 95) return "bg-gov-green";
    if (score >= 90) return "bg-gov-orange";
    return "bg-gov-amber";
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow" data-testid={`job-card-${job.id}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="font-semibold text-gray-900" data-testid={`job-title-${job.id}`}>{job.title}</h4>
          <p className="text-gray-600 text-sm" data-testid={`job-company-${job.id}`}>{job.company}</p>
          <p className="text-gray-500 text-sm flex items-center" data-testid={`job-location-${job.id}`}>
            <MapPin className="w-3 h-3 mr-1" />
            {job.location}, {job.country}
          </p>
        </div>
        <div className="text-right">
          {job.matchScore && (
            <div className={`${getMatchColor(job.matchScore)} text-white px-2 py-1 rounded text-xs font-semibold`} data-testid={`job-match-score-${job.id}`}>
              {job.matchScore}% Match
            </div>
          )}
          {job.salary && (
            <p className="text-gray-600 text-sm mt-1 flex items-center justify-end" data-testid={`job-salary-${job.id}`}>
              <DollarSign className="w-3 h-3 mr-1" />
              {job.salary}
            </p>
          )}
        </div>
      </div>

      {job.description && (
        <p className="text-gray-500 text-sm mb-3 line-clamp-2">{job.description}</p>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {job.skills?.slice(0, 4).map((skill, index) => (
          <Badge key={index} variant="secondary" className="text-xs" data-testid={`job-skill-${job.id}-${index}`}>
            {skill}
          </Badge>
        ))}
      </div>
      
      <div className="flex justify-between items-center">
        <span className="text-gray-500 text-xs" data-testid={`job-posted-date-${job.id}`}>
          Posted {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'Recently'}
        </span>
        {hasApplied ? (
          <Button
            variant="outline"
            size="sm"
            disabled
            className="text-gov-green border-gov-green"
            data-testid={`button-applied-${job.id}`}
          >
            <CheckCircle className="mr-1 h-3 w-3" />
            Applied
          </Button>
        ) : (
          <Button 
            className="bg-gov-blue text-white hover:bg-gov-dark-blue"
            size="sm"
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
            data-testid={`button-apply-${job.id}`}
          >
            {applyMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Apply Now
          </Button>
        )}
      </div>
    </div>
  );
}
