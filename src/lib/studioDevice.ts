const STUDIO_DEVICE_STORAGE_KEY = "ecclesia_studio_device_id";

function generateStudioDeviceId(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateStudioDeviceId(): string {
  if (typeof window === "undefined") {
    return generateStudioDeviceId();
  }

  try {
    const existing = window.localStorage.getItem(STUDIO_DEVICE_STORAGE_KEY);

    if (existing) {
      return existing;
    }

    const created = generateStudioDeviceId();
    window.localStorage.setItem(STUDIO_DEVICE_STORAGE_KEY, created);

    return created;
  } catch {
    return generateStudioDeviceId();
  }
}

export function getStudioDeviceLabel(deviceId?: string): string {
  if (typeof navigator === "undefined") {
    return "Dispositivo Ecclesia";
  }

  const userAgent = navigator.userAgent.toLowerCase();

  let deviceType = "Computador";

  if (/ipad|tablet/.test(userAgent)) {
    deviceType = "Tablet";
  } else if (/android|iphone|ipod|mobile/.test(userAgent)) {
    deviceType = "Celular";
  }

  const safeDeviceId = deviceId || "";

  const suffix = safeDeviceId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-4)
    .toUpperCase();

  return suffix ? `${deviceType} ${suffix}` : deviceType;
}
