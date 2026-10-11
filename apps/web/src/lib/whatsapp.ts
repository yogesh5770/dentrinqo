/**
 * WhatsApp Helper Utilities for Dental Clinic Management
 * Formats phones for India (+91) and generates high-converting branded clinic messages
 */

export function cleanIndianPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

export function openWhatsApp(phone: string, text: string): void {
  const clean = cleanIndianPhone(phone);
  if (!clean) {
    alert('Patient does not have a valid phone number recorded.');
    return;
  }
  const encoded = encodeURIComponent(text);
  const url = `https://wa.me/${clean}?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function generateAppointmentWhatsAppText(params: {
  clinicName: string;
  patientName: string;
  date: string;
  time: string;
  chairNumber: number;
  doctorName?: string;
  reason?: string;
  clinicAddress?: string;
  clinicPhone?: string;
}): string {
  return `🦷 *${params.clinicName} — Appointment Confirmation*

Dear *${params.patientName}*,
Your dental appointment has been confirmed:

📅 *Date:* ${params.date}
⏰ *Time:* ${params.time}
🪑 *Chair:* Operatory Chair ${params.chairNumber}
${params.doctorName ? `👨‍⚕️ *Doctor:* ${params.doctorName}\n` : ''}${params.reason ? `📋 *Purpose:* ${params.reason}\n` : ''}
📍 *Clinic Address:* ${params.clinicAddress || 'Madurai, Tamil Nadu'}
📞 *Helpline / Reschedule:* ${params.clinicPhone || '+91 94431 55660'}

_Please arrive 5 minutes before your slot. We look forward to caring for your smile!_`;
}

export function generatePrescriptionWhatsAppText(params: {
  clinicName: string;
  patientName: string;
  uhid: string;
  prescriptionNumber: string;
  doctorName: string;
  date: string;
  medications: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;
  generalInstructions?: string;
  clinicPhone?: string;
}): string {
  const medsList = params.medications
    .map(
      (m, idx) =>
        `${idx + 1}. *${m.name}* ${m.dosage || ''}\n   • Timing: ${m.frequency || 'As directed'} | Duration: ${m.duration || '5 days'}${m.instructions ? `\n   • Note: ${m.instructions}` : ''}`,
    )
    .join('\n\n');

  return `🦷 *${params.clinicName} — Digital Prescription*
Rx #${params.prescriptionNumber} • ${params.date}

*Patient:* ${params.patientName} (UHID: ${params.uhid})
*Consulting Dentist:* ${params.doctorName}

📋 *Prescribed Medications:*
${medsList}

${params.generalInstructions ? `⚠️ *General Instructions:*\n${params.generalInstructions}\n` : ''}
📞 *Need help with your medicine? Call:* ${params.clinicPhone || '+91 94431 55660'}
_Take medications strictly as instructed with water after meals._`;
}

export function generateInvoiceWhatsAppText(params: {
  clinicName: string;
  patientName: string;
  uhid: string;
  invoiceNumber: string;
  receiptNumber?: string;
  totalRupees: number;
  paidRupees: number;
  balanceRupees: number;
  paymentMethod?: string;
  clinicPhone?: string;
}): string {
  return `🦷 *${params.clinicName} — Payment Receipt*

Dear *${params.patientName}* (UHID: ${params.uhid}),
Thank you for your visit! Here is your billing summary:

📄 *Invoice #:* ${params.invoiceNumber}
${params.receiptNumber ? `🧾 *Receipt #:* ${params.receiptNumber}\n` : ''}💵 *Total Bill:* ₹${params.totalRupees.toLocaleString('en-IN')}
✅ *Amount Paid:* ₹${params.paidRupees.toLocaleString('en-IN')}${params.paymentMethod ? ` (${params.paymentMethod})` : ''}
${params.balanceRupees > 0 ? `⏳ *Balance Outstanding:* ₹${params.balanceRupees.toLocaleString('en-IN')}\n` : '🎉 *Status:* Paid in Full\n'}
📞 *For questions or receipts, call:* ${params.clinicPhone || '+91 94431 55660'}
_Wishing you excellent dental health!_`;
}

export function generateFollowUpWhatsAppText(params: {
  clinicName: string;
  patientName: string;
  procedure: string;
  type: string;
  clinicPhone?: string;
}): string {
  if (params.type === 'RECALL') {
    return `🦷 *${params.clinicName} — Routine Dental Checkup Reminder*

Hello *${params.patientName}*,
It has been 6 months since your last dental cleaning (${params.procedure}). 

Preventive care keeps your teeth healthy and prevents plaque buildup! Would you like to schedule your routine 6-month checkup this week?

📞 *Reply to this message or call:* ${params.clinicPhone || '+91 94431 55660'}`;
  }

  return `🦷 *${params.clinicName} — Post-Treatment Care Check*

Hello *${params.patientName}*,
We are checking in following your recent dental procedure (*${params.procedure}*). 

How is your recovery? If you are experiencing any sensitivity, tenderness, or have questions about medications, please let us know right away!

📞 *Clinic Helpline:* ${params.clinicPhone || '+91 94431 55660'}`;
}
