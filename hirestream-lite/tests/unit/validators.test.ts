import { describe, it, expect } from '@jest/globals';
import { registerSchema, loginSchema, otpSchema } from '../../shared/validators';

describe('registerSchema', () => {
  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'Test@123',
      role: 'candidate',
    });
    expect(result.success).toBe(true);
  });

  it('accepts registration with optional phone and fullName', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'Test@123',
      role: 'agent',
      phone: '9876543210',
      fullName: 'John Doe',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = registerSchema.safeParse({
      password: 'Test@123',
      role: 'candidate',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = registerSchema.safeParse({
      email: 'not-valid',
      password: 'Test@123',
      role: 'candidate',
    });
    expect(result.success).toBe(false);
  });

  it('rejects weak password (too short)', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'Ab1!',
      role: 'candidate',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'abcdefg1!',
      role: 'candidate',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without special character', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'Abcdefg1',
      role: 'candidate',
    });
    expect(result.success).toBe(false);
  });

  it('accepts strong password (8+ chars, upper, lower, digit, special)', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'Test@123',
      role: 'candidate',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'Test@123',
      role: 'superadmin',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all three valid roles', () => {
    for (const role of ['candidate', 'agent', 'employer']) {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'Test@123',
        role,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('loginSchema', () => {
  it('accepts valid username + password', () => {
    const result = loginSchema.safeParse({
      username: 'user@example.com',
      password: 'Test@123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({
      username: 'user@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty username', () => {
    const result = loginSchema.safeParse({
      username: '',
      password: 'Test@123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty body', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('otpSchema', () => {
  it('accepts valid 6-digit OTP', () => {
    const result = otpSchema.safeParse({
      email: 'user@example.com',
      otp: '123456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects OTP shorter than 6 digits', () => {
    const result = otpSchema.safeParse({
      email: 'user@example.com',
      otp: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('rejects OTP longer than 6 digits', () => {
    const result = otpSchema.safeParse({
      email: 'user@example.com',
      otp: '1234567',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = otpSchema.safeParse({
      email: 'not-email',
      otp: '123456',
    });
    expect(result.success).toBe(false);
  });
});
