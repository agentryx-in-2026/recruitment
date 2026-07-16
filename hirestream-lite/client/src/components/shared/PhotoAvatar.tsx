// Shared avatar component — renders a candidate / user photo if photoUrl is
// present, otherwise falls back to colored initials. Extracted from
// candidate-dashboard.tsx so every listing (agent-candidate-detail, employer
// review queue, agent applicants, admin candidates view, etc.) renders
// candidate photos consistently.
//
// Usage:
//   <PhotoAvatar photoUrl={candidate.photoUrl} name={candidate.fullName} />
//   <PhotoAvatar photoUrl={url} name={name} size="w-20 h-20" rounded="rounded-2xl" />
import React from "react";

export interface PhotoAvatarProps {
  photoUrl: string | null | undefined;
  name: string;
  /** Tailwind size classes — defaults to medium 12x12 */
  size?: string;
  /** Tailwind rounding — defaults to rounded-full. Use rounded-2xl for the
   *  large detail-page hero so it matches the card corner radius. */
  rounded?: string;
  /** Tailwind text size for the initials fallback */
  textSize?: string;
  /** Optional extra classes (border, ring, etc.) */
  className?: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PhotoAvatar({
  photoUrl,
  name,
  size = "w-12 h-12",
  rounded = "rounded-full",
  textSize = "text-sm",
  className = "",
}: PhotoAvatarProps) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${size} ${rounded} object-cover bg-slate-100 ${className}`}
        // Hide broken-image icon — if the URL 404s, swap to initials by
        // dispatching an empty src; React rerenders with the fallback below.
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div
      className={`${size} ${rounded} bg-gradient-to-br from-blue-500 to-indigo-700 text-white font-bold ${textSize} flex items-center justify-center shrink-0 ${className}`}
    >
      {initialsOf(name)}
    </div>
  );
}
