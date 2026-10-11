import { AuthService } from './auth.service';
import * as crypto from 'crypto';

describe('Task 1: Authentication & Session Secret Security', () => {
  const originalEnv = process.env.SESSION_SECRET;
  const mockPrisma = {} as any;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SESSION_SECRET = originalEnv;
    } else {
      delete process.env.SESSION_SECRET;
    }
  });

  describe('Startup & Fail-Closed Behavior', () => {
    it('MUST fail and throw fatal error if SESSION_SECRET is undefined', () => {
      delete process.env.SESSION_SECRET;
      expect(() => new AuthService(mockPrisma)).toThrow(
        /FATAL SECURITY CONFIGURATION ERROR: SESSION_SECRET environment variable is missing/,
      );
    });

    it('MUST fail and throw fatal error if SESSION_SECRET is shorter than 32 characters', () => {
      process.env.SESSION_SECRET = 'short-insecure-key-12345'; // only 24 chars
      expect(() => new AuthService(mockPrisma)).toThrow(
        /minimum 32 characters required/,
      );
    });

    it('MUST successfully instantiate when provided a cryptographically strong 64-char secret', () => {
      process.env.SESSION_SECRET = 'a'.repeat(64);
      expect(() => new AuthService(mockPrisma)).not.toThrow();
    });
  });

  describe('Token Signature & Cryptographic Verification', () => {
    const validSecret = 'f3b89a02c81e4b8d7a16e502c4b819e6d30f18a5e729c1b4e058d2a6f194c7b2'; // 64 chars
    let authService: AuthService;

    beforeEach(() => {
      process.env.SESSION_SECRET = validSecret;
      authService = new AuthService(mockPrisma);
    });

    it('creates and verifies a valid token payload', () => {
      const user = {
        id: 'user-uuid-1',
        clinicId: 'clinic-aks-uuid',
        email: 'dentist@akselitedental.com',
        username: 'dr_dentist',
        role: 'DENTIST',
      };

      const token = authService.createToken(user);
      expect(typeof token).toBe('string');
      expect(token).toContain('.');

      const verified = authService.verifyToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe('user-uuid-1');
      expect(verified?.clinicId).toBe('clinic-aks-uuid');
      expect(verified?.role).toBe('DENTIST');
    });

    it('MUST REJECT tokens signed with the old hardcoded fallback secret', () => {
      const oldFallbackSecret = 'aks-elite-dental-secure-monolith-secret-key-2026';
      const payload = {
        userId: 'attacker-id',
        clinicId: 'clinic-aks-uuid',
        email: 'attacker@evil.com',
        role: 'CLINIC_ADMIN',
        exp: Date.now() + 3600000,
      };

      const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const forgedSig = crypto.createHmac('sha256', oldFallbackSecret).update(data).digest('base64url');
      const forgedToken = `${data}.${forgedSig}`;

      const verified = authService.verifyToken(forgedToken);
      expect(verified).toBeNull(); // Must reject!
    });

    it('MUST REJECT tokens with tampered signatures or modified payload', () => {
      const user = {
        id: 'user-uuid-1',
        clinicId: 'clinic-aks-uuid',
        email: 'reception@akselitedental.com',
        role: 'RECEPTIONIST',
      };

      const token = authService.createToken(user);
      const [data, sig] = token.split('.');

      // Attacker tampers with payload data to elevate role to CLINIC_ADMIN
      const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      parsed.role = 'CLINIC_ADMIN';
      const tamperedData = Buffer.from(JSON.stringify(parsed)).toString('base64url');
      const tamperedToken = `${tamperedData}.${sig}`;

      expect(authService.verifyToken(tamperedToken)).toBeNull();
    });

    it('MUST REJECT expired tokens', () => {
      const expiredPayload = {
        userId: 'user-uuid-1',
        clinicId: 'clinic-aks-uuid',
        email: 'user@test.com',
        role: 'DENTIST',
        exp: Date.now() - 1000, // expired 1 second ago
      };

      const data = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
      const sig = crypto.createHmac('sha256', validSecret).update(data).digest('base64url');
      const expiredToken = `${data}.${sig}`;

      expect(authService.verifyToken(expiredToken)).toBeNull();
    });

    it('MUST REJECT malformed strings and non-tokens', () => {
      expect(authService.verifyToken('')).toBeNull();
      expect(authService.verifyToken('not-a-token')).toBeNull();
      expect(authService.verifyToken('a.b.c')).toBeNull();
      expect(authService.verifyToken('invalid-base64.signature')).toBeNull();
    });
  });
});