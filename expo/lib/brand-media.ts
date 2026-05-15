const BRAND_AVATAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#123B3A"/>
      <stop offset="48%" stop-color="#061214"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="ring" x1="80" y1="90" x2="430" y2="430" gradientUnits="userSpaceOnUse">
      <stop stop-color="#38D7FF"/>
      <stop offset="0.52" stop-color="#55F5B2"/>
      <stop offset="1" stop-color="#FFB84C"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.1 0 0 0 0 1 0 0 0 0 0.75 0 0 0 0.85 0"/>
      <feBlend in="SourceGraphic"/>
    </filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <path d="M50 272c80-100 322-108 410-14" fill="none" stroke="#38D7FF" stroke-opacity="0.28" stroke-width="2"/>
  <circle cx="256" cy="256" r="184" fill="none" stroke="url(#ring)" stroke-width="14" opacity="0.95" filter="url(#glow)"/>
  <circle cx="256" cy="256" r="137" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="2"/>
  <path d="M278 92 146 278h92l-34 142 164-218h-97l7-110Z" fill="#DFFAF5" opacity="0.95"/>
  <path d="M278 92 146 278h92l-34 142 164-218h-97l7-110Z" fill="none" stroke="#55F5B2" stroke-width="10" stroke-linejoin="round" opacity="0.7" filter="url(#glow)"/>
  <path d="M110 381c38 18 79 28 124 30" stroke="#FFB84C" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
  <path d="M390 129c22 17 39 37 54 61" stroke="#38D7FF" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
</svg>`;

const BRAND_BANNER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420">
  <defs>
    <radialGradient id="orbA" cx="20%" cy="26%" r="55%">
      <stop offset="0%" stop-color="#1C6B63" stop-opacity="0.95"/>
      <stop offset="62%" stop-color="#031113" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orbB" cx="82%" cy="20%" r="48%">
      <stop offset="0%" stop-color="#174E8A" stop-opacity="0.8"/>
      <stop offset="70%" stop-color="#01060A" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="stroke" x1="90" y1="70" x2="1050" y2="360" gradientUnits="userSpaceOnUse">
      <stop stop-color="#38D7FF"/>
      <stop offset="0.48" stop-color="#55F5B2"/>
      <stop offset="1" stop-color="#FFB84C"/>
    </linearGradient>
    <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M72 0H0v72" fill="none" stroke="#7AF7D1" stroke-opacity="0.08" stroke-width="1"/>
    </pattern>
    <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1200" height="420" fill="#020607"/>
  <rect width="1200" height="420" fill="url(#grid)"/>
  <rect width="1200" height="420" fill="url(#orbA)"/>
  <rect width="1200" height="420" fill="url(#orbB)"/>
  <path d="M-60 316C156 142 366 105 573 208c201 101 383 79 690-106" fill="none" stroke="url(#stroke)" stroke-width="5" stroke-opacity="0.7"/>
  <path d="M-30 354c230-116 407-114 535-31 170 110 360 80 728-84" fill="none" stroke="#55F5B2" stroke-width="2" stroke-opacity="0.25"/>
  <g opacity="0.22" filter="url(#blur)">
    <circle cx="248" cy="210" r="92" fill="#55F5B2"/>
    <circle cx="900" cy="132" r="118" fill="#38D7FF"/>
  </g>
  <g transform="translate(84 82) scale(0.58)" opacity="0.88">
    <circle cx="256" cy="256" r="178" fill="none" stroke="url(#stroke)" stroke-width="16"/>
    <path d="M278 92 146 278h92l-34 142 164-218h-97l7-110Z" fill="#DFFAF5" opacity="0.9"/>
    <path d="M278 92 146 278h92l-34 142 164-218h-97l7-110Z" fill="none" stroke="#55F5B2" stroke-width="10" stroke-linejoin="round" opacity="0.7"/>
  </g>
  <text x="426" y="178" fill="#F4FFF9" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="900" letter-spacing="4">SOLTOOLS</text>
  <text x="428" y="228" fill="#8BA0A5" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">ON-CHAIN SOCIAL ALPHA</text>
</svg>`;

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

export const DEFAULT_BRAND_AVATAR_URI: string = svgToDataUri(BRAND_AVATAR_SVG);
export const DEFAULT_BRAND_BANNER_URI: string = svgToDataUri(BRAND_BANNER_SVG);

/** Returns a branded avatar image when the user/community has not uploaded one. */
export function withDefaultAvatar(url: string | null | undefined): string {
  return url && url.trim().length > 0 ? url : DEFAULT_BRAND_AVATAR_URI;
}

/** Returns a branded banner image when the user/community has not uploaded one. */
export function withDefaultBanner(url: string | null | undefined): string {
  return url && url.trim().length > 0 ? url : DEFAULT_BRAND_BANNER_URI;
}
