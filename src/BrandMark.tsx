import { useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://zera-hub-api.onrender.com' : 'http://localhost:4000');

export function BrandMark({ site }: { site?: { logoUrl?: string } | null }) {
  const rawLogoUrl = site?.logoUrl ? site.logoUrl : '/logo.png';
  const logoUrl = rawLogoUrl
    ? (rawLogoUrl.startsWith('http') || rawLogoUrl.startsWith('data:') || rawLogoUrl.startsWith('/') ? rawLogoUrl : `${API}${rawLogoUrl.startsWith('/') ? rawLogoUrl : `/${rawLogoUrl}`}`)
    : '/logo.png';
  const normalizeLogoUrl = (value: string) => {
    try {
      return encodeURI(decodeURI(value));
    } catch {
      return encodeURI(value);
    }
  };
  const safeLogoUrl = logoUrl ? normalizeLogoUrl(logoUrl) : '/logo.png';

  useEffect(() => {
    if (!safeLogoUrl) return;
    let favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.append(favicon);
    }
    favicon.href = safeLogoUrl;
  }, [safeLogoUrl]);

  return (
    <span className="brand-mark">
      <img src={safeLogoUrl} alt="ZERA HUB logo" onError={(e) => {
        const target = e.currentTarget;
        if (target.src !== '/logo.png') {
          target.src = '/logo.png';
        }
      }} />
    </span>
  );
}
