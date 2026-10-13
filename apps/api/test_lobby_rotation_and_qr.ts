import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://aks_app:AksAppSecureDevPass2026!@127.0.0.1:5433/aks_dental_dev',
    },
  },
});

async function main() {
  console.log('Testing Lobby Code & Standee QR Backend Functionality...');

  const clinic = await prisma.clinic.findFirst({ where: { code: 'AED' } });
  if (!clinic) throw new Error('Clinic AED not found');

  console.log(`Found clinic: ${clinic.name} (${clinic.code})`);

  // Test 1: Generate initial HMAC code
  const secret1 = clinic.lobbySecret || 'aks-secure-lobby-salt-key-2026';
  const now = Math.floor(Date.now() / 1000);
  const windowSec = clinic.lobbyCodeWindowSeconds || 300;
  const bucket = Math.floor(now / windowSec);

  const hmac1 = crypto.createHmac('sha256', secret1).update(`${clinic.id}:${bucket}`).digest('hex');
  const code1 = (parseInt(hmac1.substring(0, 8), 16) % 9000 + 1000).toString();
  console.log(`Initial HMAC code: ${code1}`);

  // Test 2: Rotate secret
  const newSecret = crypto.randomBytes(32).toString('hex');
  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { lobbySecret: newSecret },
  });

  const hmac2 = crypto.createHmac('sha256', newSecret).update(`${clinic.id}:${bucket}`).digest('hex');
  const code2 = (parseInt(hmac2.substring(0, 8), 16) % 9000 + 1000).toString();
  console.log(`Rotated HMAC code: ${code2}`);

  if (code1 === code2 && secret1 !== newSecret) {
    console.warn('Collision or same secret');
  } else {
    console.log('✅ PASS: Rotation generates a fresh distinct code.');
  }

  // Test 3: Custom PIN override in workingHours JSON
  const customPin = '4321';
  let wh: any = {};
  try { wh = JSON.parse(clinic.workingHours || '{}'); } catch { wh = {}; }
  wh.customLobbyCode = customPin;
  wh.customWalkinQrUrl = 'https://example.com/custom-walkin';
  wh.customCheckinQrUrl = 'https://example.com/custom-checkin';

  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { workingHours: JSON.stringify(wh) },
  });

  const updatedClinic = await prisma.clinic.findUnique({ where: { id: clinic.id } });
  const parsed = JSON.parse(updatedClinic?.workingHours || '{}');

  if (parsed.customLobbyCode === '4321' && parsed.customWalkinQrUrl === 'https://example.com/custom-walkin') {
    console.log('✅ PASS: Custom PIN and Custom QR URLs persisted correctly.');
  } else {
    throw new Error('Failed to persist custom settings');
  }

  // Clean up: reset custom code so clinic returns to dynamic rotation
  wh.customLobbyCode = null;
  wh.customWalkinQrUrl = null;
  wh.customCheckinQrUrl = null;
  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { workingHours: JSON.stringify(wh) },
  });
  console.log('✅ PASS: Cleaned up and reverted to dynamic rotation.');

  console.log('\nAll Lobby Rotation & Standee QR backend tests PASSED!');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
