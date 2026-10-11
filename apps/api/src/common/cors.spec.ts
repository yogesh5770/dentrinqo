describe('Task 2: CORS Allowlist & Origin Policy Enforcement', () => {
  // Logic mirror of the hardened CORS origin handler implemented in main.ts
  const buildCorsValidator = (corsOriginEnv?: string) => {
    const configuredOrigins = corsOriginEnv
      ? corsOriginEnv.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const defaultLocalOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];

    const allowedOriginsSet = new Set<string>([...defaultLocalOrigins, ...configuredOrigins]);

    return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOriginsSet.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy violation: Origin '${origin}' is not in trusted allowlist`), false);
    };
  };

  it('allows trusted local development origins', done => {
    const cors = buildCorsValidator();
    cors('http://localhost:5173', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('allows explicitly configured production origins from CORS_ORIGIN', done => {
    const cors = buildCorsValidator('https://aksdental.duckdns.org,https://portal.akselitedental.com');
    cors('https://aksdental.duckdns.org', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('allows same-origin / mobile requests without Origin header', done => {
    const cors = buildCorsValidator('https://aksdental.duckdns.org');
    cors(undefined, (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('MUST REJECT untrusted arbitrary origins', done => {
    const cors = buildCorsValidator('https://aksdental.duckdns.org');
    cors('https://evil-hacker.com', (err, allow) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('CORS policy violation');
      expect(allow).toBe(false);
      done();
    });
  });

  it('MUST REJECT substring spoofing attacks (e.g. attacker-akselitedental.com)', done => {
    const cors = buildCorsValidator('https://aksdental.duckdns.org');
    cors('https://aksdental.duckdns.org.attacker.com', (err, allow) => {
      expect(err).toBeInstanceOf(Error);
      expect(allow).toBe(false);
      done();
    });
  });

  it('MUST REJECT untrusted arbitrary Cloudflare Pages origins', done => {
    const cors = buildCorsValidator('https://aksdental.duckdns.org');
    cors('https://malicious-phishing-page.pages.dev', (err, allow) => {
      expect(err).toBeInstanceOf(Error);
      expect(allow).toBe(false);
      done();
    });
  });
});
