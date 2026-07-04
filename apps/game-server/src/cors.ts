const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

export const gameServerCorsOptions = {
  origin: (origin: string | undefined, callback: CorsOriginCallback) => {
    callback(null, isCorsOriginAllowed(origin));
  },
  credentials: true,
};

function isCorsOriginAllowed(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  if (readAllowedOrigins().has(origin)) {
    return true;
  }

  return isAllowedNetworkDevOrigin(origin);
}

function readAllowedOrigins() {
  return new Set(
    [
      ...defaultAllowedOrigins,
      ...splitOrigins(process.env.NEXT_PUBLIC_APP_URL),
      ...splitOrigins(process.env.GAME_SERVER_CORS_ORIGINS),
      ...splitOrigins(process.env.CORS_ORIGINS),
    ].filter(Boolean),
  );
}

function splitOrigins(value: string | undefined) {
  return value
    ? value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];
}

function isAllowedNetworkDevOrigin(origin: string) {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.GAME_SERVER_ALLOW_NETWORK_DEV_ORIGINS === 'false'
  ) {
    return false;
  }

  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  return (
    url.protocol === 'http:' &&
    (url.port || '80') === '3000' &&
    isAllowedDevHost(url.hostname)
  );
}

function isAllowedDevHost(hostname: string) {
  const hostnameWithoutIpv6Brackets = hostname.replace(/^\[|\]$/g, '');

  if (
    hostnameWithoutIpv6Brackets === 'localhost' ||
    hostnameWithoutIpv6Brackets === '127.0.0.1' ||
    hostnameWithoutIpv6Brackets === '::1'
  ) {
    return true;
  }

  const octets = hostnameWithoutIpv6Brackets.split('.').map(Number);

  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}
