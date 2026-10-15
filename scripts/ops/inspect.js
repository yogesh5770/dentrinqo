const fs = require('fs');
const envContent = fs.readFileSync('/var/www/aks-elite-dental/.env', 'utf8');
envContent.split('\n').forEach(line => {
  const parts = line.trim().split('=');
  if (parts.length >= 2 && !parts[0].startsWith('#')) {
    process.env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const { PrismaClient } = require('/var/www/aks-elite-dental/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const invs = await prisma.invoice.findMany({ include: { items: true, payments: true, patient: true } });
  console.log('--- ALL INVOICES ---');
  console.log(JSON.stringify(invs, null, 2));
  
  const plans = await prisma.treatmentPlan.findMany({ include: { items: true } });
  console.log('--- ALL PLANS ---');
  console.log(JSON.stringify(plans, null, 2));

  const appts = await prisma.appointment.findMany({ include: { patient: true } });
  console.log('--- ALL APPOINTMENTS ---');
  console.log(JSON.stringify(appts, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error(err);
    prisma.$disconnect();
  });
