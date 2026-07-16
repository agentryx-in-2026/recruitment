import { Candidate } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Globe, Languages, Eye, Mail } from "lucide-react";

interface CandidateCardProps {
  candidate: Candidate & { matchScore?: number };
}

export function CandidateCard({ candidate }: CandidateCardProps) {
  const getMatchColor = (score?: number) => {
    if (!score) return "bg-gray-500";
    if (score >= 95) return "bg-gov-green";
    if (score >= 90) return "bg-gov-orange";
    return "bg-gov-amber";
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow" data-testid={`candidate-card-${candidate.id}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div className="flex items-start space-x-4">
          <img 
            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=60&h=60" 
            alt="Candidate" 
            className="w-15 h-15 rounded-full object-cover"
            data-testid={`candidate-avatar-${candidate.id}`}
          />
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h4 className="font-semibold text-gray-900" data-testid={`candidate-name-${candidate.id}`}>
                {candidate.fullName}
              </h4>
              {candidate.matchScore && (
                <Badge className={`${getMatchColor(candidate.matchScore)} text-white`} data-testid={`candidate-match-score-${candidate.id}`}>
                  {candidate.matchScore}% Match
                </Badge>
              )}
            </div>
            <p className="text-gray-600 text-sm mb-2" data-testid={`candidate-experience-${candidate.id}`}>
              {candidate.experience} years experience
            </p>
            <p className="text-gray-500 text-sm mb-3 flex items-center" data-testid={`candidate-location-${candidate.id}`}>
              <MapPin className="w-4 h-4 mr-1" />
              {candidate.location}
            </p>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {candidate.skills?.slice(0, 4).map((skill, index) => (
                <Badge key={index} variant="secondary" className="text-xs" data-testid={`candidate-skill-${candidate.id}-${index}`}>
                  {skill}
                </Badge>
              ))}
            </div>
            
            <div className="text-sm text-gray-600">
              <p className="flex items-center mb-1" data-testid={`candidate-languages-${candidate.id}`}>
                <Languages className="w-4 h-4 mr-2" />
                English (Fluent), Hindi (Native)
              </p>
              <p className="flex items-center" data-testid={`candidate-preferred-countries-${candidate.id}`}>
                <Globe className="w-4 h-4 mr-2" />
                Preferred: {candidate.preferredCountries?.join(", ")}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 md:mt-0 flex flex-col space-y-2">
          <Button 
            className="bg-gov-blue text-white hover:bg-gov-dark-blue"
            size="sm"
            data-testid={`button-view-profile-${candidate.id}`}
          >
            <Eye className="mr-2 h-4 w-4" />
            View Profile
          </Button>
          <Button 
            variant="outline" 
            className="border-gov-green text-gov-green hover:bg-gov-green hover:text-white"
            size="sm"
            data-testid={`button-contact-${candidate.id}`}
          >
            <Mail className="mr-2 h-4 w-4" />
            Contact
          </Button>
        </div>
      </div>
    </div>
  );
}
