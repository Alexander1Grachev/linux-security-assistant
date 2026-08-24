// Список доверенных доменов — расширяй по мере необходимости
export const WHITELISTED_DOMAINS = [
  "google.com",
  "youtube.com",
  "github.com",
  "gitlab.com",
  "wikipedia.org",
  "stackoverflow.com",
  "microsoft.com",
  "apple.com",
  "mozilla.org",
  "npmjs.com",
  "fedoraproject.org",
];

export function isWhitelisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    // Локальные/приватные адреса никогда не должны уходить во внешний API —
    // это бесполезно (VirusTotal не видит твою локальную сеть) и потенциально
    // сливает секреты (токены, nonce, локальные session-id) третьей стороне
    if (isLocalOrPrivateAddress(hostname)) {
      return true;
    }

    return WHITELISTED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

function isLocalOrPrivateAddress(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return true;
  }
  // Приватные диапазоны IPv4: 10.x, 172.16-31.x, 192.168.x
  const privateIpPattern =
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
  if (privateIpPattern.test(hostname)) {
    return true;
  }
  return false;
}