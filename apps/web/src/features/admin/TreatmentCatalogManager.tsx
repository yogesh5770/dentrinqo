import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import {
  IndianRupee,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Stethoscope,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  X,
  Save,
  Tag,
} from 'lucide-react';

export interface TreatmentItem {
  id: string;
  code: string;
  name: string;
  category: string;
  standardFeePaise: number;
  description?: string | null;
  isActive: boolean;
}

const COMMON_CATEGORY_SUGGESTIONS = [
  'General Consultation',
  'Preventive',
  'Restorative',
  'Endodontics',
  'Prosthodontics',
  'Oral Surgery',
  'Implantology',
  'Periodontics',
  'Orthodontics',
  'Pedodontics',
  'Aesthetics',
  'Laser Dentistry',
];

export const TreatmentCatalogManager: React.FC = () => {
  const [items, setItems] = useState<TreatmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TreatmentItem | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('Restorative');
  const [feeRupees, setFeeRupees] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchCatalog = async (silent?: boolean | unknown) => {
    const isSilent = silent === true;
    try {
      if (!isSilent) setLoading(true);
      const data = await apiRequest<TreatmentItem[]>('/procedures/catalogue?all=true');
      setItems(data || []);
    } catch (err: any) {
      console.error('Failed to load procedure catalogue:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  useClinicSync(() => fetchCatalog(true));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setName('');
    setCode('');
    setCategory('General Consultation');
    setFeeRupees('');
    setDescription('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: TreatmentItem) => {
    setEditingItem(item);
    setName(item.name);
    setCode(item.code);
    setCategory(item.category || 'General');
    setFeeRupees((item.standardFeePaise / 100).toString());
    setDescription(item.description || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!name.trim()) {
      setModalError('Please enter procedure name');
      return;
    }

    const feeNum = parseFloat(feeRupees);
    if (isNaN(feeNum) || feeNum < 0) {
      setModalError('Please enter a valid fee amount');
      return;
    }

    const standardFeePaise = Math.round(feeNum * 100);

    setSubmitting(true);
    try {
      if (editingItem) {
        await apiRequest(`/procedures/catalogue/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim(),
            category: category.trim(),
            standardFeePaise,
            description: description.trim() || undefined,
          }),
        });
        showToast(`Treatment "${name.trim()}" updated successfully!`);
      } else {
        await apiRequest('/procedures/catalogue', {
          method: 'POST',
          body: JSON.stringify({
            code: code.trim() || undefined,
            name: name.trim(),
            category: category.trim(),
            standardFeePaise,
            description: description.trim() || undefined,
          }),
        });
        showToast(`New treatment "${name.trim()}" added to catalog!`);
      }

      setIsModalOpen(false);
      triggerClinicSync('catalogue_updated');
      fetchCatalog(true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to save treatment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (item: TreatmentItem) => {
    try {
      await apiRequest(`/procedures/catalogue/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          isActive: !item.isActive,
        }),
      });
      triggerClinicSync('catalogue_updated');
      showToast(
        `"${item.name}" ${!item.isActive ? 'activated' : 'deactivated'} in active catalog`
      );
      fetchCatalog(true);
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  // Dynamic categories from catalog
  const existingCategories = Array.from(new Set(items.map(i => i.category || 'General')));
  const availableCategories = ['All', ...existingCategories];

  const filteredItems = items.filter(item => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const activeCount = items.filter(i => i.isActive).length;
  const totalCount = items.length;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Overview KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="clinic-card p-3 sm:p-4 bg-teal-50/50 border border-teal-200 rounded-xl">
          <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-teal-800">
            Active Catalog
          </div>
          <div className="text-xl sm:text-2xl font-black text-teal-950 mt-1 font-mono">{activeCount}</div>
          <div className="text-[10px] sm:text-[11px] text-teal-700 font-medium mt-0.5 truncate">
            Available for billing
          </div>
        </div>

        <div className="clinic-card p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-600">
            Total Treatments
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 font-mono">{totalCount}</div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5 truncate">
            Configured by admin
          </div>
        </div>

        <div className="clinic-card p-3 sm:p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl">
          <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-800">
            Categories
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-950 mt-1 font-mono">
            {existingCategories.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-emerald-700 font-medium mt-0.5 truncate">
            Clinical specialties
          </div>
        </div>

        <div className="clinic-card p-3 sm:p-4 bg-purple-50/50 border border-purple-200 rounded-xl">
          <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-purple-800">
            Front Desk Ready
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-950 mt-1 font-mono">
            {totalCount > 0 ? '100%' : '0%'}
          </div>
          <div className="text-[10px] sm:text-[11px] text-purple-700 font-medium mt-0.5 truncate">
            Auto-fills in invoices
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Category Filters, and Add Button */}
      <div className="clinic-card p-3.5 sm:p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search treatments or codes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 bg-slate-50 focus:bg-white transition-all font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCatalog()}
              title="Refresh Catalog"
              className="p-2 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 hover:text-slate-900 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleOpenAddModal}
              className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs py-2 px-3.5 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Add Treatment & Price</span>
            </button>
          </div>
        </div>

        {/* Category Pills (Touch friendly, horizontally scrollable) */}
        {existingCategories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar text-xs -mx-1 px-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Category:
            </span>
            {availableCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content: Empty State, Mobile Cards, or Desktop Table */}
      {loading ? (
        <div className="clinic-card bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 text-xs shadow-xs">
          <RefreshCw className="w-6 h-6 text-teal-600 animate-spin mx-auto mb-2" />
          Loading treatment catalog...
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div className="clinic-card bg-white border border-dashed border-slate-300 rounded-2xl p-8 sm:p-14 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center mx-auto mb-3.5 shadow-xs">
            <IndianRupee className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-black text-slate-900">
            Treatment & Price Catalog is Empty
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5 leading-relaxed">
            No clinical treatments have been added yet. As the Clinic Administrator, click below to add your clinic's services, categories, and standard INR fees.
          </p>
          <button
            onClick={handleOpenAddModal}
            className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs py-2.5 px-5 rounded-xl shadow-xs inline-flex items-center gap-2 cursor-pointer transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Add First Treatment & Price</span>
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="clinic-card bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500 text-xs shadow-xs">
          <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="font-bold text-slate-700">No procedures match your filter</p>
          <p className="text-slate-400 mt-0.5">Try adjusting your search query or category filter</p>
        </div>
      ) : (
        <div className="clinic-card bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          {/* MOBILE VIEW: Touch-friendly cards (< sm) */}
          <div className="sm:hidden divide-y divide-slate-100">
            {filteredItems.map(item => (
              <div
                key={item.id || item.code}
                className={`p-3.5 space-y-2.5 transition-colors ${
                  !item.isActive ? 'bg-slate-50/60 opacity-60' : 'bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-slate-900 text-sm leading-snug">
                      {item.name}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-md text-[10px] font-bold">
                        {item.category || 'General'}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 font-semibold">
                        {item.code}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-black text-slate-900 text-base">
                      ₹{((item.standardFeePaise || 0) / 100).toLocaleString('en-IN')}
                    </div>
                    <span className="text-[10px] text-slate-400 block font-medium">Standard Tariff</span>
                  </div>
                </div>

                {item.description && (
                  <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      item.isActive
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-600 border border-slate-300'
                    }`}
                  >
                    {item.isActive ? '● ACTIVE' : 'DISABLED'}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="px-3 py-1.5 text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleToggleStatus(item)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg text-xs cursor-pointer"
                      title={item.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {item.isActive ? (
                        <ToggleRight className="w-4 h-4 text-teal-600" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP / TABLET VIEW: High-density Table (>= sm) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-12">#</th>
                  <th className="py-3 px-4">Treatment / Procedure Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4 text-right">Standard Fee (₹)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => (
                  <tr
                    key={item.id || item.code}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      !item.isActive ? 'opacity-60 bg-slate-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-sm">{item.name}</div>
                      {item.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {item.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-md text-[11px] font-bold">
                        {item.category || 'General'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 font-semibold">
                      {item.code}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-mono font-black text-slate-900 text-sm">
                        ₹{((item.standardFeePaise || 0) / 100).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                          ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300">
                          DISABLED
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="px-2.5 py-1 text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Edit Procedure & Price"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={`p-1 rounded-lg border cursor-pointer transition-colors ${
                            item.isActive
                              ? 'text-slate-400 hover:text-rose-600 border-slate-200 hover:border-rose-200'
                              : 'text-emerald-600 hover:text-emerald-800 border-emerald-200 bg-emerald-50'
                          }`}
                          title={item.isActive ? 'Deactivate from Billing' : 'Reactivate for Billing'}
                        >
                          {item.isActive ? (
                            <ToggleRight className="w-4 h-4 text-teal-600" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Treatment Modal (Fully Mobile Responsive) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl overflow-y-auto max-h-[92vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-teal-600" />
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  {editingItem ? 'Edit Treatment & Pricing' : 'Add New Clinical Treatment'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer font-bold p-1"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTreatment} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Treatment / Procedure Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ultrasonic Scaling & Polishing, Zirconia Crown, etc."
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    if (!editingItem && !code) {
                      const autoCode = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '_')
                        .slice(0, 24);
                      setCode(autoCode);
                    }
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Category (Type custom or pick) *
                  </label>
                  <input
                    type="text"
                    required
                    list="category-suggestions"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="e.g. Preventive, Endodontics, Aligners"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 bg-white font-medium"
                  />
                  <datalist id="category-suggestions">
                    {COMMON_CATEGORY_SUGGESTIONS.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                    {existingCategories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Standard Tariff / Fee (₹ INR) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="50"
                      placeholder="e.g. 1500"
                      value={feeRupees}
                      onChange={e => setFeeRupees(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl pl-7 pr-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Procedure Identifier Code (Short reference)
                </label>
                <input
                  type="text"
                  placeholder="e.g. SCALING_FULL"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  disabled={Boolean(editingItem)}
                  className={`w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono ${
                    editingItem ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
                  }`}
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Used internally for billing & EHR line items.
                </span>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Clinical Description / Materials (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Single-visit protocol with high-translucency monolithic zirconia"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-black shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Treatment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
