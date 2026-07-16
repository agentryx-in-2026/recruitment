import { ReactNode } from "react";
import { TrendingUp } from "lucide-react";

interface MetricsCardProps {
  title: string;
  value: string | number;
  growth?: number;
  icon: ReactNode;
  colorClass: string;
}

export function MetricsCard({ title, value, growth, icon, colorClass }: MetricsCardProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm" data-testid={`metrics-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center">
        <div className={`${colorClass} text-white p-3 rounded-lg`} data-testid={`metrics-icon-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {icon}
        </div>
        <div className="ml-4">
          <p className="text-2xl font-bold text-gray-900" data-testid={`metrics-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          <p className="text-gray-600 text-sm" data-testid={`metrics-title-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {title}
          </p>
          {growth !== undefined && (
            <p className="text-green-600 text-xs flex items-center" data-testid={`metrics-growth-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              <TrendingUp className="w-3 h-3 mr-1" />
              +{growth}% this month
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
