import { useEffect } from 'react';

export const palettes = { ocean: '电光蓝', jade: '深海青', violet: '星云紫' } as const;
export type Brand = { name: string; theme: keyof typeof palettes; logo: string };
export const defaultBrand: Brand = { name: 'OpenWorkMate', theme: 'ocean', logo: '' };

export function useBrandAppearance(brand: Brand, base: string, admin = false) {
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const apply = (value: Brand) => {
      document.documentElement.dataset.theme = value.theme;
      document.title = value.name + (admin ? ' · 系统管理' : '');
      if (icon) {
        icon.type = value.logo ? 'image/png' : 'image/svg+xml';
        icon.href = value.logo || base + 'brand/logo.svg';
      }
    };
    apply(brand);
    return () => apply(defaultBrand);
  }, [brand, base, admin]);
}
