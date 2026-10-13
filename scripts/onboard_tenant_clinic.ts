import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { hash } from '@node-rs/argon2';

/**
 * Production Tenant Clinic Onboarding Automation
 *
 * Executes the entire clinic onboarding workflow in a single atomic transaction:
 * 1. Creates Clinic record with verified flags, operational params, and secure lobby secret
 * 2. Creates ClinicDomain entries for production domains and staging/DuckDNS URLs
 * 3. Creates ClinicWorkingHour records for all 7 days with lunch break
 * 4. Generates cryptographically secure ClinicDisplayToken for Waiting Room TV
 * 5. Creates the initial CLINIC_ADMIN user account with Argon2 password hashing
 * 6. Logs immutable audit trail record (TENANT_CLINIC_ONBOARDED)
 *
 * Usage:
 *   npx ts-node scripts/onboard_tenant_clinic.ts --name "Jacobs Dental Clinic" --code "JDC" --subdomain "jacob" \
 *     --phone "+919750031330" --admin-email "admin@jacobdental.com" --admin-pass "SecurePass2026!" \
 *     --domains "jacobdental.com,www.jacobdental.com,jacobdental.duckdns.org"
 */

export interface OnboardClinicInput {
  name: string;
  code: string;
  subdomain?: string;
  phone: string;
  email?: string;
  tagline?: string;
  emergencyPhone?: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  chairCount?: number;
  upiVpa?: string;
  gstin?: string;
  domains: Array<{ domain: string; isPrimary: boolean }>;
  adminUser: {
    email: string;
    fullName: string;
    phone: string;
    password: string;
  };
}

export async function onboardTenantClinic(input: OnboardClinicInput, prismaClient?: PrismaClient) {
  const prisma = prismaClient || new PrismaClient();

  const codeUpper = input.code.trim().toUpperCase();
  const lobbySecret = crypto.randomBytes(32).toString('hex');
  const rawTvToken = crypto.randomBytes(32).toString('hex');
  const tvTokenHash = crypto.createHash('sha256').update(rawTvToken).digest('hex');
  const passwordHash = await hash(input.adminUser.password);

  console.log(`[ONBOARDING] Starting atomic onboarding for clinic ${codeUpper} (${input.name})...`);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create Clinic
    const clinic = await tx.clinic.create({
      data: {
        name: input.name.trim(),
        code: codeUpper,
        subdomain: input.subdomain ? input.subdomain.trim().toLowerCase() : undefined,
        phone: input.phone.trim(),
        email: input.email ? input.email.trim().toLowerCase() : undefined,
        tagline: input.tagline || 'Multispeciality Dental Clinic & Implant Centre',
        emergencyPhone: input.emergencyPhone || input.phone.trim(),
        address: input.address.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        postalCode: input.postalCode.trim(),
        chairCount: input.chairCount || 3,
        upiVpa: input.upiVpa || undefined,
        gstin: input.gstin || undefined,
        status: 'ACTIVE',
        planTier: 'PROFESSIONAL',
        lobbySecret,
        requireLobbyCode: true,
        lobbyCodeDigits: 4,
        lobbyCodeWindowSeconds: 300,
        isDoctorVerified: true,
        isBillingVerified: true,
        hoursEnforced: true,
        workingHoursConfigured: true,
        lastWalkinMinutesBeforeClose: 30,
        lastWalkinTime: '20:00',
        minVisitsForWaitEstimate: 20,
      },
    });

    // 2. Create Domain mappings
    const createdDomains = [];
    for (const d of input.domains) {
      const dom = await tx.clinicDomain.create({
        data: {
          clinicId: clinic.id,
          domain: d.domain.trim().toLowerCase(),
          isPrimary: d.isPrimary,
        },
      });
      createdDomains.push(dom);
    }

    // 3. Create 7-day Working Hours Schedule
    for (let day = 0; day < 7; day++) {
      const isSun = day === 0;
      await tx.clinicWorkingHour.create({
        data: {
          clinicId: clinic.id,
          dayOfWeek: day,
          isOpen: true,
          openTime: isSun ? '10:00' : '09:00',
          closeTime: isSun ? '14:00' : '20:30',
          hasBreak: !isSun,
          breakStart: !isSun ? '13:30' : null,
          breakEnd: !isSun ? '14:30' : null,
        },
      });
    }

    // 4. Create ClinicDisplayToken for Waiting Room TV
    const displayToken = await tx.clinicDisplayToken.create({
      data: {
        clinicId: clinic.id,
        name: `${input.name} - Waiting Room TV`,
        tokenHash: tvTokenHash,
        isRevoked: false,
      },
    });

    // 5. Create initial CLINIC_ADMIN User
    const adminUser = await tx.user.create({
      data: {
        clinicId: clinic.id,
        email: input.adminUser.email.trim().toLowerCase(),
        fullName: input.adminUser.fullName.trim(),
        phone: input.adminUser.phone.trim(),
        passwordHash,
        role: 'CLINIC_ADMIN',
        isActive: true,
        mustChangePassword: true,
      },
    });

    // 6. Record Audit Log entry
    await tx.auditLog.create({
      data: {
        clinicId: clinic.id,
        actorId: adminUser.id,
        actorRole: 'CLINIC_ADMIN',
        action: 'TENANT_CLINIC_ONBOARDED',
        entityType: 'Clinic',
        entityId: clinic.id,
        details: JSON.stringify({
          clinicCode: clinic.code,
          domains: input.domains.map((d) => d.domain),
          adminEmail: adminUser.email,
          onboardedAt: new Date().toISOString(),
        }),
      },
    });

    return {
      clinic,
      domains: createdDomains,
      displayToken,
      rawTvToken,
      adminUser,
    };
  });

  console.log(`[ONBOARDING SUCCESS] Successfully onboarded clinic ${result.clinic.code}!`);
  console.log(`- Clinic ID: ${result.clinic.id}`);
  console.log(`- Admin Email: ${result.adminUser.email}`);
  console.log(`- Primary Domain: ${result.domains.find((d) => d.isPrimary)?.domain || 'N/A'}`);
  console.log(`- TV Raw Display Token: ${result.rawTvToken}`);
  console.log(`  (Pass in x-display-token header for waiting room TV kiosks)`);

  return result;
}

// CLI Execution Support
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const name = getArg('--name');
  const code = getArg('--code');
  const phone = getArg('--phone');
  const adminEmail = getArg('--admin-email');
  const adminPass = getArg('--admin-pass');
  const domainList = getArg('--domains');

  if (!name || !code || !phone || !adminEmail || !adminPass || !domainList) {
    console.error('Usage: npx ts-node scripts/onboard_tenant_clinic.ts \\');
    console.error('  --name "Jacobs Dental Clinic" --code "JDC" --phone "+919750031330" \\');
    console.error('  --admin-email "admin@jacobdental.com" --admin-pass "Pass123!" \\');
    console.error('  --domains "jacobdental.com,www.jacobdental.com,jacobdental.duckdns.org"');
    process.exit(1);
  }

  const rawDomains = domainList.split(',').map((s) => s.trim()).filter(Boolean);
  const domains = rawDomains.map((domain, idx) => ({
    domain,
    isPrimary: idx === 0,
  }));

  onboardTenantClinic({
    name,
    code,
    phone,
    email: adminEmail,
    address: getArg('--address') || 'Clinic Address',
    city: getArg('--city') || 'Madurai',
    state: getArg('--state') || 'Tamil Nadu',
    postalCode: getArg('--postal') || '625001',
    chairCount: Number(getArg('--chairs') || 3),
    domains,
    adminUser: {
      email: adminEmail,
      fullName: getArg('--admin-name') || `${name} Administrator`,
      phone,
      password: adminPass,
    },
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[ONBOARDING ERROR]:', err);
      process.exit(1);
    });
}
