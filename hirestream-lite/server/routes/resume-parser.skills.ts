// Mirror of client/src/lib/reference-data.ts SKILL_CATEGORIES for server-side parsing.
// Keep in sync when reference-data changes.

export const SKILL_CATEGORIES: { category: string; skills: string[] }[] = [
  {
    category: "Information Technology",
    skills: [
      "React", "Node.js", "JavaScript", "TypeScript", "Python", "Java",
      "C++", "PHP", "SQL", "MongoDB", "PostgreSQL", "MySQL",
      "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes",
      "DevOps", "CI/CD", "Git", "Linux", "REST API",
      "HTML", "CSS", "Tailwind", "Angular", "Vue.js",
      "React Native", "Flutter", "Swift", "Android", "iOS",
      "Machine Learning", "Data Science", "AI",
      "Cybersecurity", "Network Administration", "SAP",
    ],
  },
  {
    category: "Healthcare & Nursing",
    skills: [
      "Nursing", "Patient Care", "CPR", "BLS", "ACLS",
      "ICU Care", "Emergency Care", "Pediatric Care",
      "Geriatric Care", "Mental Health Nursing",
      "Pharmacy", "Lab Technician", "Radiology",
      "Physiotherapy", "Occupational Therapy",
      "Medical Coding", "Health Records", "Infection Control",
      "Midwifery", "Dental Assistant", "Optometry",
    ],
  },
  {
    category: "Construction & Engineering",
    skills: [
      "Welding", "Plumbing", "Electrical", "HVAC",
      "Carpentry", "Masonry", "Painting", "Tiling",
      "Civil Engineering", "Structural Engineering",
      "AutoCAD", "Revit", "Project Management",
      "Site Supervision", "Quality Control", "Safety Management",
      "Crane Operation", "Heavy Equipment", "Scaffolding",
      "Piping", "Fabrication", "Steel Fixing",
    ],
  },
  {
    category: "Hospitality & Tourism",
    skills: [
      "Cooking", "Baking", "Pastry", "Chef",
      "Hotel Management", "Front Desk", "Housekeeping",
      "F&B Service", "Bartending", "Barista",
      "Event Management", "Tourism Guide", "Travel Agent",
      "Restaurant Management", "Catering",
      "Food Safety", "HACCP", "Menu Planning",
    ],
  },
  {
    category: "Manufacturing & Industrial",
    skills: [
      "Machine Operation", "CNC Programming", "Quality Inspection",
      "Assembly Line", "Packaging", "Forklift Operation",
      "Warehouse Management", "Inventory Control",
      "Textile", "Garment", "Tailoring", "Embroidery",
      "Electronics Assembly", "PCB Soldering",
      "Plastic Molding", "Die Casting",
    ],
  },
  {
    category: "Office & Administration",
    skills: [
      "MS Office", "Excel", "Word", "PowerPoint",
      "Data Entry", "Typing", "Accounting", "Tally",
      "HR Management", "Payroll", "Recruitment",
      "Customer Service", "Call Center", "Receptionist",
      "Office Administration", "Filing", "Scheduling",
    ],
  },
  {
    category: "Transport & Logistics",
    skills: [
      "Driving (LMV)", "Driving (HMV)", "Driving (International)",
      "Logistics", "Supply Chain", "Fleet Management",
      "Delivery", "Courier", "Shipping",
      "Cold Chain Management", "Customs Clearance",
    ],
  },
  {
    category: "Languages & Soft Skills",
    skills: [
      "English", "Hindi", "Arabic", "French", "German",
      "Japanese", "Korean", "Mandarin",
      "Communication", "Leadership", "Team Management",
      "Problem Solving", "Time Management", "Negotiation",
      "Presentation", "Public Speaking",
    ],
  },
];

export const ALL_SKILLS = SKILL_CATEGORIES.flatMap(c => c.skills);
