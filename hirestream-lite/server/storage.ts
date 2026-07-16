import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import { type User, type InsertUser, users } from "@shared/schema";
import { eq, or } from "drizzle-orm";

export interface IStorage {
  db?: any; // Expose db for direct queries when needed
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

// In-memory storage (for development without database)
export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username || user.email === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      ...insertUser,
      id: crypto.randomUUID(),
      role: insertUser.role || "candidate",
      aadhaarNumber: null,
      aadhaarVerified: false,
      phoneNumber: null,
      phoneVerified: false,
      himAccessId: null,
      preferredLanguage: "en",
      isActive: true,
      lastLoginAt: null,
      notifyEmail: true,
      notifySms: true,
      notifyInApp: true,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
    };
    this.users.set(user.id, user);
    return user;
  }
}

// PostgreSQL storage (for production)
export class PgStorage implements IStorage {
  public db;

  constructor(connectionString: string) {
    const pool = new Pool({ connectionString });
    this.db = drizzle({ client: pool });
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(
      or(eq(users.username, username), eq(users.email, username))
    ).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }
}

// Export storage instance based on environment
const dbUrl = process.env.NODE_ENV === "test" && process.env.TEST_DATABASE_URL
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

export const storage: IStorage = dbUrl
  ? new PgStorage(dbUrl)
  : new MemStorage();
