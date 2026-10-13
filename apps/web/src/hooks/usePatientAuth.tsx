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

const PATIENT_TOKEN_KEY = 'dental_patient_token';
const PATIENT_ACCOUNT_KEY = 'dental_patient_account';
const PATIENT_FAMILY_KEY = 'dental_patient_family';

function getStoredPatientToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PATIENT_TOKEN_KEY) || localStorage.getItem('aks_patient_token');
}

function setStoredPatientToken(tok: string | null) {
  if (typeof window === 'undefined') return;
  if (tok) {
    localStorage.setItem(PATIENT_TOKEN_KEY, tok);
    localStorage.setItem('aks_patient_token', tok);
  } else {
    localStorage.removeItem(PATIENT_TOKEN_KEY);
    localStorage.removeItem('aks_patient_token');
  }
}

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
  }
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<PatientAccount | null>(() => getStoredPatientAccount());
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(() => getStoredFamilyMembers());
  const [token, setToken] = useState<string | null>(() => getStoredPatientToken());
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(getStoredPatientToken() && !getStoredPatientAccount());
  });

  const refresh = async () => {
    try {
      const storedToken = getStoredPatientToken();
      if (!storedToken) {
        setAccount(null);
        setFamilyMembers([]);
        setStoredPatientData(null, []);
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/patient-auth/me', {
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
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
        // ONLY clear session if server explicitly returns 401 Unauthorized
        setStoredPatientToken(null);
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

    setStoredPatientToken(data.token);
    setToken(data.token);
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

    setStoredPatientToken(data.token);
    setToken(data.token);
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
    setStoredPatientToken(null);
    setStoredPatientData(null, []);
    setToken(null);
    setAccount(null);
    setFamilyMembers([]);
  };

  const addFamilyMember = async (member: any) => {
    const storedToken = getStoredPatientToken() || token;
    const res = await fetch('/api/patient-auth/family', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${storedToken}`,
      },
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
