import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "../storage";
import bcrypt from "bcrypt";
import type { User } from "@shared/schema";

passport.use(
  new LocalStrategy(
    { usernameField: "username" }, // We expect clients to send "username" (which may be an email)
    async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || user.isActive === false) {
          return done(null, false, { message: "Invalid username or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Invalid username or password" });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export { passport };
