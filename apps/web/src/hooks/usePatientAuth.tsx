import React, { createContext, useContext, useState, useEffect } from 'react';

interface FamilyMember {
  id: string;
  uhid: string;
  fullName: string;
  relationToAccount: string;
  gender: string;
  age?: number | null;
  dateOfBirth?: string | null;
  dobApproximate?: boolean;
}

interface PatientAccount {
  id: string;
  phone: string;
  lastLoginAt?: string | null;
}

interface PatientAuthContextType {
  account: PatientAccount | null;
  familyMembers: FamilyMember[];
  token: string | null;
  isLoading: boolean;
  login: (phone: string, pass: string, clinicCode?: string) => Promise<any>;
  signup: (payload: any) => Promise<any>;
  logout: () => Promise<void>;
  addFamilyMember: (member: any) => Promise<any>;
  refresh: () => Promise<void>;
}

// Keys retained for non-sensitive UI state (phone display) only - NOT for auth.
// Tokens are carried by the httpOnly aks_patient_session cookie from the server.
const PATIENT_ACCOUNT_KEY = 'dental_patient_account';
const PATIENT_FAMILY_KEY = 'dental_patient_family';

function getStoredPatientAccount(): PatientAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(PATIENT_ACCOUNT_KEY);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

function getStoredFamilyMembers(): FamilyMember[] {
  if (typeof window === 'undefined') return [];
  try {
    const val = localStorage.getItem(PATIENT_FAMILY_KEY);
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

function setStoredPatientData(acc: PatientAccount | null, fam: FamilyMember[] = []) {
  if (typeof window === 'undefined') return;
  if (acc) {
    localStorage.setItem(PATIENT_ACCOUNT_KEY, JSON.stringify(acc));
    localStorage.setItem(PATIENT_FAMILY_KEY, JSON.stringify(fam));
  } else {
    localStorage.removeItem(PATIENT_ACCOUNT_KEY);
    localStorage.removeItem(PATIENT_FAMILY_KEY);
    // Legacy token keys removed
    ['dental_patient_token', 'aks_patient_token'].forEach((k) => localStorage.removeItem(k));
  }
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<PatientAccount | null>(() => getStoredPatientAccount());
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(() => getStoredFamilyMembers());
  // token is no longer stored; kept in state as null - context consumers that
  // read it will receive null and should not be sending it via Authorization header.
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refresh = async () => {
    try {
      // Session is carried by the httpOnly cookie; no Authorization header needed.
      const res = await fetch('/api/patient-auth/me', {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        const acc = {
          id: data.id,
          phone: data.phone,
          lastLoginAt: data.lastLoginAt,
        };
        const fam = data.familyMembers || [];
        setAccount(acc);
        setFamilyMembers(fam);
        setStoredPatientData(acc, fam);
      } else if (res.status === 401) {
        setStoredPatientData(null, []);
        setToken(null);
        setAccount(null);
        setFamilyMembers([]);
      }
    } catch {
      // offline fallback - retain current cached account
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (phone: string, pass: string, clinicCode?: string) => {
    const res = await fetch('/api/patient-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, password: pass, clinicCode }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }

    // Server sets aks_patient_session httpOnly cookie; no token stored client-side.
    setToken(null);
    setAccount(data.account);
    const fam = data.familyMembers || [];
    setFamilyMembers(fam);
    setStoredPatientData(data.account, fam);
    return data;
  };

  const signup = async (payload: any) => {
    const res = await fetch('/api/patient-auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    // Server sets aks_patient_session httpOnly cookie.
    setToken(null);
    setAccount(data.account);
    const fam = data.familyMembers || [];
    setFamilyMembers(fam);
    setStoredPatientData(data.account, fam);
    await refresh();
    return data;
  };

  const logout = async () => {
    try {
      await fetch('/api/patient-auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    setStoredPatientData(null, []);
    setToken(null);
    setAccount(null);
    setFamilyMembers([]);
  };

  const addFamilyMember = async (member: any) => {
    // No Authorization header - session cookie is sent automatically.
    const res = await fetch('/api/patient-auth/family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(member),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to add family member');
    }

    await refresh();
    return data;
  };

  return (
    <PatientAuthContext.Provider
      value={{
        account,
        familyMembers,
        token,
        isLoading,
        login,
        signup,
        logout,
        addFamilyMember,
        refresh,
      }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
};

export const usePatientAuth = () => {
  const context = useContext(PatientAuthContext);
  if (!context) {
    throw new Error('usePatientAuth must be used within PatientAuthProvider');
  }
  return context;
};
