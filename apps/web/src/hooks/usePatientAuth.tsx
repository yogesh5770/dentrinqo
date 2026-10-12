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
  login: (phone: string, pass: string) => Promise<any>;
  signup: (payload: any) => Promise<any>;
  logout: () => Promise<void>;
  addFamilyMember: (member: any) => Promise<any>;
  refresh: () => Promise<void>;
}

const PATIENT_TOKEN_KEY = 'dental_patient_token';
function getStoredPatientToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PATIENT_TOKEN_KEY) || localStorage.getItem('aks_patient_token');
}
function setStoredPatientToken(tok: string | null) {
  if (typeof window === 'undefined') return;
  if (tok) {
    localStorage.setItem(PATIENT_TOKEN_KEY, tok);
  } else {
    localStorage.removeItem(PATIENT_TOKEN_KEY);
    localStorage.removeItem('aks_patient_token');
  }
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<PatientAccount | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [token, setToken] = useState<string | null>(() => getStoredPatientToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refresh = async () => {
    try {
      const storedToken = getStoredPatientToken();
      if (!storedToken) {
        setAccount(null);
        setFamilyMembers([]);
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/patient-auth/me', {
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setAccount({
          id: data.id,
          phone: data.phone,
          lastLoginAt: data.lastLoginAt,
        });
        setFamilyMembers(data.familyMembers || []);
      } else {
        setStoredPatientToken(null);
        setToken(null);
        setAccount(null);
        setFamilyMembers([]);
      }
    } catch {
      // offline fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (phone: string, pass: string) => {
    const res = await fetch('/api/patient-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password: pass }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }

    setStoredPatientToken(data.token);
    setToken(data.token);
    setAccount(data.account);
    setFamilyMembers(data.familyMembers || []);
    return data;
  };

  const signup = async (payload: any) => {
    const res = await fetch('/api/patient-auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    setStoredPatientToken(data.token);
    setToken(data.token);
    setAccount(data.account);
    await refresh();
    return data;
  };

  const logout = async () => {
    try {
      await fetch('/api/patient-auth/logout', { method: 'POST' });
    } catch {}
    setStoredPatientToken(null);
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
