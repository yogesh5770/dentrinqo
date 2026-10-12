import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import {
  CreditCard,
  IndianRupee,
  CheckCircle2,
  Receipt,
  Smartphone,
  Banknote,
  Building,
  AlertCircle,
  QrCode,
  Copy,
  Check,
  Calculator,
  ShieldAlert,
} from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
  onPaymentSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onPaymentSuccess,
}) => {
  if (!isOpen || !invoice) return null;

  const balanceRupees = Math.round(invoice.balancePaise / 100);
  const [amountRupees, setAmountRupees] = useState<number>(balanceRupees);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'NETBANKING'>('UPI');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cash Tendered & Change Calculator
  const [cashTendered, setCashTendered] = useState<number>(balanceRupees);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const { user } = useAuth();
  const { clinic: tenantClinic } = useTenant();

  const isBillingVerified = Boolean(tenantClinic?.isBillingVerified ?? user?.clinic?.isBillingVerified ?? false);

  // Clinic UPI details
  const clinicUpiId = tenantClinic?.upiVpa || user?.clinic?.upiVpa || '';
  const clinicName = tenantClinic?.name || user?.clinic?.name || 'Dental Clinic';
  const upiPayload = `upi://pay?pa=${clinicUpiId}&pn=${encodeURIComponent(clinicName)}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent(`INV_${invoice.invoiceNumber}`)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiPayload)}`;

  const changeDue = Math.max(0, cashTendered - amountRupees);

  const handleCopyUpi = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(clinicUpiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (amountRupees <= 0) {
      setError('Payment amount must be greater than zero');
      return;
    }
    if (amountRupees > balanceRupees) {
      setError(`Amount cannot exceed outstanding balance of ₹${balanceRupees.toLocaleString('en-IN')}`);
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/billing/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          amountPaise: Math.round(amountRupees * 100),
          paymentMethod,
          referenceNumber: referenceNumber.trim() || undefined,
          notes: notes.trim() || (paymentMethod === 'CASH' && cashTendered > amountRupees ? `Tendered: ₹${cashTendered}, Change returned: ₹${changeDue}` : undefined),
        }),
      });

      triggerClinicSync('payment_recorded');
      onPaymentSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Payment recording failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-black">
              <Receipt className="w-4 h-4 text-teal-700" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base">Reception Payment Checkout</h3>
              <p className="text-[11px] text-slate-500 font-medium">Record patient settlement & issue receipt</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>

        {/* Invoice Summary Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-semibold">Invoice Number:</span>
            <span className="font-mono font-black text-slate-900 text-xs bg-white px-2 py-0.5 rounded border border-slate-200">
              {invoice.invoiceNumber}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-semibold">Patient:</span>
            <span className="font-bold text-slate-900">
              {invoice.patient?.fullName || 'Patient'} ({invoice.patient?.uhid || ''})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-semibold">Total Billed:</span>
            <span className="font-mono font-bold text-slate-900">
              ₹{(invoice.totalPaise / 100).toLocaleString('en-IN')}
            </span>
          </div>
          {invoice.paidPaise > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold">Already Paid:</span>
              <span className="font-mono text-emerald-700 font-bold">
                ₹{(invoice.paidPaise / 100).toLocaleString('en-IN')}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm">
            <span className="font-black text-slate-900">Balance Due Now:</span>
            <span className="font-mono font-black text-emerald-700 text-base">
              ₹{balanceRupees.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Input & Quick Settle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-black text-slate-800">Amount to Settle (₹) *</label>
              <button
                type="button"
                onClick={() => {
                  setAmountRupees(balanceRupees);
                  setCashTendered(balanceRupees);
                }}
                className="text-[11px] font-black text-teal-700 hover:text-teal-900 cursor-pointer bg-teal-50 px-2 py-0.5 rounded border border-teal-200"
              >
                Clear Full Balance (₹{balanceRupees.toLocaleString('en-IN')})
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-400 font-black text-base">₹</span>
              <input
                type="number"
                required
                min="1"
                max={balanceRupees}
                value={amountRupees}
                onChange={e => {
                  const val = Number(e.target.value);
                  setAmountRupees(val);
                  if (cashTendered < val) setCashTendered(val);
                }}
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-base font-mono font-black text-slate-900 focus:ring-2 focus:ring-teal-500 bg-white"
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-black text-slate-800 block mb-1.5">Select Payment Method *</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPaymentMethod('UPI')}
                className={`flex items-center gap-2 p-3 rounded-xl border font-bold transition-all cursor-pointer ${
                  paymentMethod === 'UPI'
                    ? 'bg-teal-50 border-2 border-teal-600 text-teal-950 shadow-xs ring-1 ring-teal-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-4 h-4 text-teal-600" />
                <span>UPI (GPay / PhonePe / QR)</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CASH')}
                className={`flex items-center gap-2 p-3 rounded-xl border font-bold transition-all cursor-pointer ${
                  paymentMethod === 'CASH'
                    ? 'bg-emerald-50 border-2 border-emerald-600 text-emerald-950 shadow-xs ring-1 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Physical Cash in Desk</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CARD')}
                className={`flex items-center gap-2 p-3 rounded-xl border font-bold transition-all cursor-pointer ${
                  paymentMethod === 'CARD'
                    ? 'bg-purple-50 border-2 border-purple-600 text-purple-950 shadow-xs ring-1 ring-purple-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span>Card (POS Machine)</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('NETBANKING')}
                className={`flex items-center gap-2 p-3 rounded-xl border font-bold transition-all cursor-pointer ${
                  paymentMethod === 'NETBANKING'
                    ? 'bg-sky-50 border-2 border-sky-600 text-sky-950 shadow-xs ring-1 ring-sky-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Building className="w-4 h-4 text-sky-600" />
                <span>Net Banking / NEFT</span>
              </button>
            </div>
          </div>

          {/* DYNAMIC UPI QR CODE DISPLAY */}
          {paymentMethod === 'UPI' && (
            !isBillingVerified || !clinicUpiId ? (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs space-y-1.5 text-amber-950">
                <div className="font-black flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>UPI QR Collection Paused (Verification Pending)</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                  Official clinic UPI ID and banking details have not been verified by the Clinic Administrator yet. Please collect via Cash or Card until verified in Clinic Settings.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-xs">
                <div className="bg-white p-2 rounded-xl shadow-xs border border-teal-100 shrink-0 text-center">
                  <img
                    src={qrCodeUrl}
                    alt="Dynamic UPI QR Code"
                    className="w-32 h-32 object-contain rounded-lg"
                    loading="lazy"
                  />
                  <span className="text-[10px] font-black text-teal-800 uppercase tracking-wider block mt-1">
                    Scan to Pay ₹{amountRupees}
                  </span>
                </div>

                <div className="space-y-2 text-slate-800">
                  <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-teal-600" />
                    <span>Instant Mobile Payment</span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Patient can scan this QR code using Google Pay, PhonePe, Paytm, or BHIM. Amount ₹{amountRupees} is pre-configured.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold bg-white px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-800">
                      {clinicUpiId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="p-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 cursor-pointer text-[10px] font-bold flex items-center gap-1"
                      title="Copy UPI ID"
                    >
                      {copiedUpi ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          )}

          {/* CASH CALCULATOR (Tender & Change Due) */}
          {paymentMethod === 'CASH' && (
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-emerald-950 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-700" />
                  Cash Till Tender Calculator
                </span>
                <span className="font-mono font-black text-emerald-900">
                  Bill: ₹{amountRupees}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Cash Handed by Patient (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min={amountRupees}
                    value={cashTendered}
                    onChange={e => setCashTendered(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl pl-7 pr-3 py-1.5 text-sm font-mono font-bold text-slate-900 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Quick Cash Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[amountRupees, 500, 1000, 2000, 5000]
                  .filter(v => v >= amountRupees)
                  .filter((v, idx, arr) => arr.indexOf(v) === idx)
                  .map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCashTendered(val)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                        cashTendered === val
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {val === amountRupees ? `Exact (₹${val})` : `₹${val}`}
                    </button>
                  ))}
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Change Due to Patient:</span>
                <span className={`font-mono font-black text-sm ${changeDue > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                  ₹{changeDue.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}

          {/* Reference Number for Digital Transactions */}
          {paymentMethod !== 'CASH' && (
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Transaction / UTR Reference No (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. UPI Ref 30981240982 / Card Auth Code 84920"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 font-mono"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Receipt / Accounting Notes</label>
            <input
              type="text"
              placeholder="e.g. Paid in full at front-desk checkout"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 font-medium"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5 active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Recording Settlement...' : `Confirm & Collect Payment (₹${amountRupees.toLocaleString('en-IN')})`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
