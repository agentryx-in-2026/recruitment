# HP Overseas Job Portal

## Overview

This is an AI-first Overseas Job Portal developed for the Government of Himachal Pradesh. The portal connects Himachali candidates seeking international employment opportunities with overseas employers and verified recruitment agents. The system features intelligent AI-powered matching, automated workflows, and comprehensive user management across multiple user types (candidates, recruitment agents, overseas employers, and administrators).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The application uses a modern React-based frontend with the following key decisions:

**Framework Choice**: React with TypeScript for type safety and better developer experience. Uses Vite for fast development builds and hot reloading.

**UI Component System**: Built on Radix UI primitives with shadcn/ui components for consistent, accessible design. Tailwind CSS provides utility-first styling with custom government branding colors.

**State Management**: Uses React Context for role-based navigation and TanStack React Query for server state management and caching.

**Routing**: Implements client-side routing with wouter, featuring role-based page rendering where different dashboards are shown based on user role (candidate, agent, employer, admin).

**Responsive Design**: Mobile-first approach with responsive breakpoints and mobile-specific components using custom hooks for device detection.

### Backend Architecture

**Server Framework**: Express.js with TypeScript running on Node.js, providing RESTful API endpoints with proper error handling middleware.

**Database Layer**: Uses Drizzle ORM with PostgreSQL (via Neon serverless) for type-safe database operations. Database schema includes tables for users, candidates, jobs, applications, and related entities.

**Storage Interface**: Implements an abstraction layer (IStorage) allowing for both in-memory storage during development and PostgreSQL in production.

**Development Setup**: Vite middleware integration for seamless full-stack development with hot reloading and proper asset serving.

### Data Storage Solutions

**Primary Database**: PostgreSQL configured for serverless deployment through Neon, chosen for its reliability and ACID compliance requirements for sensitive employment data.

**ORM**: Drizzle ORM selected for its TypeScript-first approach, providing excellent type inference and compile-time safety for database operations.

**Schema Design**: Normalized relational design with proper foreign key relationships between users, candidates, jobs, and applications. Includes support for array fields for skills and preferences.

**Migration Management**: Uses Drizzle Kit for database migrations and schema versioning.

### Authentication and Authorization Mechanisms

**Role-Based Access**: Four distinct user roles (candidate, agent, employer, admin) with role-specific dashboards and functionality.

**Session Management**: Prepared for session-based authentication with connect-pg-simple for PostgreSQL session storage.

**Security Considerations**: Built with security-first principles including CORS configuration, input validation, and secure session handling.

### External Dependencies

**Database**: Neon PostgreSQL serverless database for production data storage
**UI Components**: Radix UI primitives for accessible component foundations
**Styling**: Tailwind CSS for utility-first styling approach
**Form Management**: React Hook Form with Zod resolvers for type-safe form validation
**HTTP Client**: Native Fetch API with TanStack React Query for intelligent caching and synchronization
**Development Tools**: Replit-specific plugins for error overlay and cartographer integration
**Date Handling**: date-fns for consistent date manipulation and formatting
**Icons**: Lucide React for consistent iconography throughout the application