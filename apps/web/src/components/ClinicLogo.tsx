import React, { useEffect, useMemo, useState } from 'react';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../hooks/useAuth';

interface ClinicLogoProps {
  className?: string;
  /** Override alt text; defaults to "<Clinic name> logo". */
  alt?: string;
}

/**
 * Resolves the current tenant's logo. Order:
 *   1. clinic.logoUrl (DB-managed, per tenant)
 *   2. /brand/<code>.png (bundled convention asset)
 *   3. Neutral initials monogram (never another clinic's logo)
 */
export const useClinicBranding = () => {
  const { clinic } = useTenant();
  const { user } = useAuth();
  const source = clinic ?? (user?.clinic as any) ?? null;

  const name: string = source?.name || 'Dental Clinic';
  const code: string = (source?.code || '').toLowerCase();
  const logoCandidates = useMemo(
    () => [source?.logoUrl, code ? `/brand/${code}.webp` : null, code ? `/brand/${code}.png` : null].filter(Boolean) as string[],
    [source?.logoUrl, code],
  );
  const initials = name
    .replace(/[^A-Za-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w && !/^(dental|clinic|and|the|hospital)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'DC';

  return { name, code, logoCandidates, initials, brandColor: source?.brandColor || '#0d9488' };
};

export const ClinicLogo: React.FC<ClinicLogoProps> = ({ className = 'w-full h-full object-contain', alt }) => {
  const { name, logoCandidates, initials, brandColor } = useClinicBranding();
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [logoCandidates.join('|')]);

  const src = logoCandidates[index];
  if (!src) {
    return (
      <span
        role="img"
        aria-label={alt || `${name} logo`}
        className={`${className} inline-flex items-center justify-center rounded-xl font-black text-white select-none`}
        style={{ background: brandColor, fontSize: '0.8em', minWidth: '1.75rem', minHeight: '1.75rem' }}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt || `${name} logo`}
      className={className}
      decoding="async"
      onError={() => setIndex((i) => i + 1)}
    />
  );
};

/** Keeps the browser tab (favicon + title) in sync with the active tenant. */
export const TenantDocumentBranding: React.FC = () => {
  const { name, logoCandidates } = useClinicBranding();
  useEffect(() => {
    document.title = `${name} | Clinic Management System`;
    const link: HTMLLinkElement =
      document.querySelector("link[rel='icon']") || Object.assign(document.createElement('link'), { rel: 'icon' });
    link.href = logoCandidates[0] || '/tooth.svg';
    link.type = link.href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    if (!link.parentNode) document.head.appendChild(link);
  }, [name, logoCandidates]);
  return null;
};

export default ClinicLogo;
