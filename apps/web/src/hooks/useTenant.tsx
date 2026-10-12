import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './useAuth';

export interface TenantClinic {
  id: string;
  name: string;
  code: string;
  tagline?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  chairCount: number;
  subdomain?: string | null;
  upiVpa?: string | null;
  workingHours?: any;
  isDoctorVerified?: boolean;
  isBillingVerified?: boolean;
}

interface TenantContextType {
  clinic: TenantClinic | null;
  isLoading: boolean;
  refreshClinic: (codeOverride?: string) => Promise<TenantClinic | null>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [clinic, setClinic] = useState<TenantClinic | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshClinic = async (codeOverride?: string): Promise<TenantClinic | null> => {
    try {
      // 1. Check URL query parameters for ?clinicCode=... or ?code=...
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const codeFromUrl = urlParams?.get('clinicCode') || urlParams?.get('code') || codeOverride;

      const endpoint = codeFromUrl 
        ? `/clinic/public-info?code=${encodeURIComponent(codeFromUrl)}`
        : '/clinic/public-info';

      const data = await apiRequest<TenantClinic>(endpoint);
      setClinic(data);
      return data;
    } catch {
      // Fallback: If user is authenticated, use user's clinic data
      if (user?.clinic) {
        const fallback: TenantClinic = {
          id: user.clinic.id || '',
          name: user.clinic.name,
          code: user.clinic.code,
          tagline: user.clinic.tagline,
          phone: user.clinic.phone,
          email: user.clinic.email,
          address: user.clinic.address,
          city: user.clinic.city,
          state: user.clinic.state,
          postalCode: user.clinic.postalCode,
          chairCount: user.clinic.chairCount || 3,
          subdomain: user.clinic.subdomain,
          upiVpa: user.clinic.upiVpa,
          workingHours: user.clinic.workingHours,
          isDoctorVerified: (user.clinic as any).isDoctorVerified,
          isBillingVerified: (user.clinic as any).isBillingVerified,
        };
        setClinic(fallback);
        return fallback;
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshClinic();
  }, [user?.clinicId]);

  return (
    <TenantContext.Provider value={{ clinic, isLoading, refreshClinic }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
