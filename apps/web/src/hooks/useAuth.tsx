import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest, setSessionToken } from '../lib/api';

export interface User {
  id: string;
  clinicId: string;
  email: string;
  fullName: string;
  role: 'CLINIC_ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'ACCOUNTANT' | 'OTHER_STAFF';
  permissions?: string[];
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
  employeeId?: string | null;
  mustChangePassword?: boolean;
  licenseNumber?: string | null;
  specialization?: string | null;
  clinic?: {
    id?: string;
    name: string;
    code: string;
    tagline?: string;
    city: string;
    state?: string;
    postalCode?: string;
    chairCount?: number;
    phone?: string;
    address?: string;
    email?: string;
    subdomain?: string;
    upiVpa?: string;
    workingHours?: any;
    gstin?: string;
    isDoctorVerified?: boolean;
    isBillingVerified?: boolean;
    isOnLeave?: boolean;
    leaveReason?: string;
  };
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  login: (email: string, pass: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem('auth_user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const token = localStorage.getItem('auth_access_token') || localStorage.getItem('aks_auth_token');
    const profile = localStorage.getItem('auth_user_profile');
    return Boolean(token && !profile);
  });

  const refreshProfile = async () => {
    const token = localStorage.getItem('auth_access_token') || localStorage.getItem('aks_auth_token');
    if (!token) {
      setUser(null);
      localStorage.removeItem('auth_user_profile');
      setIsLoading(false);
      return;
    }

    try {
      const profile = await apiRequest<User>('/auth/me');
      setUser(profile);
      localStorage.setItem('auth_user_profile', JSON.stringify(profile));
    } catch (err: any) {
      // ONLY clear session if server explicitly returns 401 Unauthorized
      if (err?.statusCode === 401) {
        setSessionToken(null);
        localStorage.removeItem('auth_user_profile');
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();
  }, []);

  const login = async (identifier: string, pass: string) => {
    const res = await apiRequest<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ emailOrUsername: identifier, password: pass }),
    });
    setSessionToken(res.token);
    setUser(res.user);
    localStorage.setItem('auth_user_profile', JSON.stringify(res.user));
    return res.user;
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setSessionToken(null);
      localStorage.removeItem('auth_user_profile');
      setUser(null);
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'CLINIC_ADMIN') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, hasPermission, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};