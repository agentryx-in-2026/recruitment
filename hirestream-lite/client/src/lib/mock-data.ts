import { Candidate, Job, Application, RecruitmentAgent, Employer } from "@shared/schema";

export const mockCandidates: (Partial<Candidate> & { id: string; fullName: string; email: string; matchScore?: number })[] = [
  {
    id: "1",
    userId: "user1",
    fullName: "Rahul Sharma",
    email: "rahul.sharma@email.com",
    phone: "+91-9876543210",
    location: "Shimla, Himachal Pradesh",
    experience: 5,
    skills: ["React", "Node.js", "AWS", "MongoDB", "TypeScript"],
    preferredCountries: ["Canada", "Australia"],
    profileComplete: true,
    resumeUrl: "/resume/rahul-sharma.pdf",
    createdAt: new Date("2024-01-15"),
    matchScore: 97
  },
  {
    id: "2",
    userId: "user2",
    fullName: "Priya Verma",
    email: "priya.verma@email.com",
    phone: "+91-9876543211",
    location: "Dharamshala, Himachal Pradesh",
    experience: 4,
    skills: ["Python", "Machine Learning", "TensorFlow", "SQL", "Data Analysis"],
    preferredCountries: ["USA", "Germany"],
    profileComplete: true,
    resumeUrl: "/resume/priya-verma.pdf",
    createdAt: new Date("2024-01-20"),
    matchScore: 94
  },
  {
    id: "3",
    userId: "user3",
    fullName: "Vikram Singh",
    email: "vikram.singh@email.com",
    phone: "+91-9876543212",
    location: "Mandi, Himachal Pradesh",
    experience: 8,
    skills: ["AutoCAD", "SolidWorks", "Project Management", "Mechanical Design"],
    preferredCountries: ["UAE", "Qatar"],
    profileComplete: true,
    resumeUrl: "/resume/vikram-singh.pdf",
    createdAt: new Date("2024-01-10"),
    matchScore: 91
  },
  {
    id: "4",
    userId: "user4",
    fullName: "Anita Kumari",
    email: "anita.kumari@email.com",
    phone: "+91-9876543213",
    location: "Kangra, Himachal Pradesh",
    experience: 3,
    skills: ["Nursing", "Patient Care", "Medical Records", "Emergency Response"],
    preferredCountries: ["UK", "New Zealand"],
    profileComplete: true,
    resumeUrl: "/resume/anita-kumari.pdf",
    createdAt: new Date("2024-02-01"),
    matchScore: 89
  },
  {
    id: "5",
    userId: "user5",
    fullName: "Deepak Thakur",
    email: "deepak.thakur@email.com",
    phone: "+91-9876543214",
    location: "Solan, Himachal Pradesh",
    experience: 6,
    skills: ["Docker", "Kubernetes", "Jenkins", "AWS", "DevOps"],
    preferredCountries: ["Canada", "Dubai"],
    profileComplete: true,
    resumeUrl: "/resume/deepak-thakur.pdf",
    createdAt: new Date("2024-01-25"),
    matchScore: 93
  }
];

export const mockJobs: (Partial<Job> & { id: string; title: string; company: string; location: string; country: string; matchScore?: number; applicationsCount?: number })[] = [
  {
    id: "job1",
    title: "Senior Software Engineer",
    company: "Tech Solutions Canada Inc.",
    location: "Toronto, Canada",
    country: "Canada",
    salary: "$85,000 CAD",
    description: "We are looking for an experienced software engineer to join our growing team.",
    requirements: ["5+ years experience", "React expertise", "Node.js proficiency"],
    skills: ["React", "Node.js", "AWS", "TypeScript"],
    experience: 5,
    employerId: "emp1",
    agentId: "agent1",
    status: "active",
    createdAt: new Date("2024-03-01"),
    matchScore: 98,
    applicationsCount: 87
  },
  {
    id: "job2",
    title: "Full Stack Developer",
    company: "Digital Innovations Ltd.",
    location: "Melbourne, Australia",
    country: "Australia",
    salary: "$90,000 AUD",
    description: "Join our dynamic team working on cutting-edge web applications.",
    requirements: ["3+ years experience", "Python knowledge", "Full-stack development"],
    skills: ["Python", "Django", "PostgreSQL", "Vue.js"],
    experience: 3,
    employerId: "emp2",
    agentId: "agent1",
    status: "active",
    createdAt: new Date("2024-02-25"),
    matchScore: 92,
    applicationsCount: 54
  },
  {
    id: "job3",
    title: "DevOps Engineer",
    company: "CloudTech Solutions",
    location: "Dubai, UAE",
    country: "UAE",
    salary: "$75,000 USD",
    description: "Looking for a DevOps engineer to manage our cloud infrastructure.",
    requirements: ["4+ years experience", "Docker/Kubernetes", "Cloud platforms"],
    skills: ["Docker", "Kubernetes", "Jenkins", "AWS"],
    experience: 4,
    employerId: "emp3",
    agentId: "agent2",
    status: "active",
    createdAt: new Date("2024-02-20"),
    matchScore: 88,
    applicationsCount: 32
  },
  {
    id: "job4",
    title: "Data Scientist",
    company: "Analytics Pro Australia",
    location: "Sydney, Australia",
    country: "Australia",
    salary: "$95,000 AUD",
    description: "Work with big data and machine learning models to drive business insights.",
    requirements: ["3+ years experience", "Python/R", "Machine Learning"],
    skills: ["Python", "Machine Learning", "TensorFlow", "SQL"],
    experience: 3,
    employerId: "emp2",
    agentId: "agent1",
    status: "active",
    createdAt: new Date("2024-02-15"),
    matchScore: 95,
    applicationsCount: 43
  },
  {
    id: "job5",
    title: "Registered Nurse",
    company: "Healthcare Solutions UK",
    location: "London, UK",
    country: "UK",
    salary: "£35,000 GBP",
    description: "Provide excellent patient care in our modern healthcare facility.",
    requirements: ["2+ years experience", "Nursing license", "Patient care skills"],
    skills: ["Nursing", "Patient Care", "Medical Records", "Emergency Response"],
    experience: 2,
    employerId: "emp4",
    agentId: "agent3",
    status: "active",
    createdAt: new Date("2024-02-10"),
    matchScore: 90,
    applicationsCount: 28
  }
];

export const mockApplications: (Partial<Application> & { id: string; status: string })[] = [
  {
    id: "app1",
    candidateId: "1",
    jobId: "job1",
    status: "interview",
    matchScore: 97,
    rejectionFeedback: null,
    appliedAt: new Date("2024-03-05")
  },
  {
    id: "app2",
    candidateId: "1",
    jobId: "job2",
    status: "review",
    matchScore: 85,
    rejectionFeedback: null,
    appliedAt: new Date("2024-03-03")
  },
  {
    id: "app3",
    candidateId: "1",
    jobId: "job3",
    status: "submitted",
    matchScore: 78,
    rejectionFeedback: null,
    appliedAt: new Date("2024-03-01")
  }
];

// `as RecruitmentAgent[]` so the inferred literal types satisfy the schema-derived
// type even though these fixtures omit the v0.4.32 KYB metadata columns (all
// nullable on the table — the cast is what was implicit before the migration).
export const mockAgents = ([
  {
    id: "agent1",
    userId: "agentuser1",
    agencyName: "Global Talent Solutions",
    licenseNumber: "HP-2024-001",
    specializations: ["IT", "Software Development", "Data Science"],
    verified: true,
    rating: 48,
    placements: 234
  },
  {
    id: "agent2",
    userId: "agentuser2",
    agencyName: "India Recruit Pro",
    licenseNumber: "HP-2024-002",
    specializations: ["Engineering", "Healthcare", "Finance"],
    verified: true,
    rating: 45,
    placements: 189
  },
  {
    id: "agent3",
    userId: "agentuser3",
    agencyName: "TechStaff International",
    licenseNumber: "HP-2024-003",
    specializations: ["Healthcare", "Education", "Hospitality"],
    verified: true,
    rating: 42,
    placements: 156
  }
] as unknown) as RecruitmentAgent[];

export const mockEmployers = ([
  {
    id: "emp1",
    userId: "empuser1",
    companyName: "TechCorp International",
    industry: "Software Development",
    location: "Toronto, Canada",
    verified: true,
    activeJobs: 23
  },
  {
    id: "emp2",
    userId: "empuser2",
    companyName: "Digital Innovations Ltd.",
    industry: "Technology",
    location: "Melbourne, Australia",
    verified: true,
    activeJobs: 15
  },
  {
    id: "emp3",
    userId: "empuser3",
    companyName: "CloudTech Solutions",
    industry: "Cloud Computing",
    location: "Dubai, UAE",
    verified: true,
    activeJobs: 8
  },
  {
    id: "emp4",
    userId: "empuser4",
    companyName: "Healthcare Solutions UK",
    industry: "Healthcare",
    location: "London, UK",
    verified: true,
    activeJobs: 12
  }
] as unknown) as Employer[];

export const mockSystemMetrics = {
  totalCandidates: 15247,
  totalJobs: 2584,
  totalPlacements: 896,
  totalAgents: 145,
  monthlyGrowth: {
    candidates: 12,
    jobs: 8,
    placements: 15,
    agents: 3
  },
  aiPerformance: {
    matchAccuracy: 96.2,
    responseTime: 1.4,
    matchesGenerated: 12456
  },
  districtDistribution: [
    { district: "Shimla", candidates: 3247, percentage: 85 },
    { district: "Kangra", candidates: 2789, percentage: 72 },
    { district: "Mandi", candidates: 2456, percentage: 65 },
    { district: "Solan", candidates: 2198, percentage: 58 },
    { district: "Others", candidates: 4557, percentage: 45 }
  ],
  topSkills: [
    { skill: "Software Development", candidates: 1847 },
    { skill: "Healthcare", candidates: 1234 },
    { skill: "Engineering", candidates: 987 },
    { skill: "Finance", candidates: 654 }
  ]
};
