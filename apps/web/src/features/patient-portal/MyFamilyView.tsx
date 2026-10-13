import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePatientAuth } from '../../hooks/usePatientAuth';
import { Users, UserPlus, ArrowLeft, Plus, Calendar, ShieldCheck, X, AlertCircle } from 'lucide-react';

export const MyFamilyView: React.FC = () => {
  const navigate = useNavigate();
  const { account, familyMembers, addFamilyMember, isLoading } = usePatientAuth();

  useEffect(() => {
    if (!isLoading && !account) {
      navigate('/patient-login');
    }
  }, [isLoading, account, navigate]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [relation, setRelation] = useState('CHILD');
  const [gender, setGender] = useState('MALE');
  const [hasExactDob, setHasExactDob] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await addFamilyMember({
        fullName: fullName.trim(),
        relationToAccount: relation,
        gender,
        dateOfBirth: hasExactDob && dateOfBirth ? dateOfBirth : undefined,
        age: !hasExactDob && age !== '' ? Number(age) : undefined,
        dobApproximate: !hasExactDob,
        notes: notes.trim() || undefined,
      });

      setIsModalOpen(false);
      setFullName('');
      setAge('');
      setDateOfBirth('');
      setNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to add family member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-16">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/my/visits"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
              title="Back to Visits"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-tight">
                Family Member Profiles
              </h1>
              <p className="text-[11px] text-teal-700 font-medium">
                Linked to account: {account?.phone}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Family Member</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {familyMembers.map((m) => (
            <div
              key={m.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                    {m.relationToAccount}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 font-bold">{m.uhid}</span>
                </div>

                <h3 className="text-base font-black text-slate-900 mt-1">{m.fullName}</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {m.gender} • {m.age ? `${m.age} yrs` : 'DOB on file'}{' '}
                  {m.dobApproximate && <span className="text-amber-600">(Approx)</span>}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <Link
                  to={`/book?patientId=${m.id}`}
                  className="text-xs font-bold text-teal-600 hover:text-teal-700"
                >
                  Book Visit for {m.fullName.split(' ')[0]} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Add Member Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-black text-slate-900 mb-1">Add Family Member</h2>
            <p className="text-xs text-slate-500 mb-4">
              Add a child, spouse, or parent to book appointments under your account.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleAdd} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aarav Kumar"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Relationship *
                  </label>
                  <select
                    value={relation}
                    onChange={(e) => setRelation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="CHILD">Child / Dependent</option>
                    <option value="SPOUSE">Spouse / Partner</option>
                    <option value="PARENT">Parent</option>
                    <option value="OTHER">Other Family</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Gender *
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">
                    {hasExactDob ? 'Date of Birth' : 'Age'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setHasExactDob(!hasExactDob)}
                    className="text-[11px] text-teal-600 font-semibold"
                  >
                    {hasExactDob ? 'Enter approximate age' : 'Enter exact birth date'}
                  </button>
                </div>

                {hasExactDob ? (
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                ) : (
                  <input
                    type="number"
                    min="1"
                    max="120"
                    placeholder="e.g. 8 years"
                    value={age}
                    onChange={(e) => setAge(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Medical Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Penicillin allergy, asthma, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition mt-2"
              >
                {submitting ? 'Adding...' : 'Save Family Profile'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
