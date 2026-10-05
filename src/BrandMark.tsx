import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://zera-hub-api.onrender.com' : 'http://localhost:4000');

export function BrandMark({ site }: { site: { logoUrl?: string } | null }) {
  const rawLogoUrl = site?.logoUrl ? site.logoUrl : '';
  const logoUrl = rawLogoUrl
    ? (rawLogoUrl.startsWith('http') ? rawLogoUrl : `${API}${rawLogoUrl.startsWith('/') ? rawLogoUrl : `/${rawLogoUrl}`}`)
    : '';
  const normalizeLogoUrl = (value: string) => {
    try {
      return encodeURI(decodeURI(value));
    } catch {
      return encodeURI(value);
    }
  };
  const safeLogoUrl = logoUrl ? normalizeLogoUrl(logoUrl) : '';

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

  return <span className="brand-mark">{safeLogoUrl ? <img src={safeLogoUrl} alt="ZERA HUB logo"/> : <Sparkles size={18}/>}</span>;
}
