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
  const duplicateInvoiceId = 'e7285de8-3b9e-4cf8-a571-7b8ee6d286e8'; // INV-2026-0002
  console.log('Finding duplicate invoice:', duplicateInvoiceId);
  const inv = await prisma.invoice.findUnique({
    where: { id: duplicateInvoiceId },
    include: { payments: true, items: true }
  });

  if (!inv) {
    console.log('Invoice not found or already deleted.');
    return;
  }

  console.log(`Deleting Invoice ${inv.invoiceNumber} with ${inv.payments.length} payment(s) and ${inv.items.length} item(s)...`);

  await prisma.$transaction(async (tx) => {
    // 1. Delete payments
    await tx.payment.deleteMany({
      where: { invoiceId: duplicateInvoiceId }
    });

    // 2. Delete invoice items
    await tx.invoiceItem.deleteMany({
      where: { invoiceId: duplicateInvoiceId }
    });

    // 3. Delete invoice
    await tx.invoice.delete({
      where: { id: duplicateInvoiceId }
    });
  });

  console.log('Successfully deleted duplicate invoice INV-2026-0002!');

  // Check remaining summary
  const remainingInvs = await prisma.invoice.findMany({
    include: { payments: true, patient: true }
  });
  console.log('--- REMAINING INVOICES ---');
  remainingInvs.forEach(i => {
    console.log({
      invoiceNumber: i.invoiceNumber,
      patient: i.patient.fullName,
      total: i.totalPaise / 100,
      paid: i.paidPaise / 100,
      balanceDue: i.balancePaise / 100,
      status: i.status
    });
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error(err);
    prisma.$disconnect();
  });
