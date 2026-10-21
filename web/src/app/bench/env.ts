interface UaDataLike {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}
interface BatteryLike {
  level: number;
  charging: boolean;
}
type NavigatorExtras = Navigator & {
  userAgentData?: UaDataLike;
  deviceMemory?: number;
  getBattery?: () => Promise<BatteryLike>;
};

export interface Battery {
  /** 0 to 1 */
  level: number;
  charging: boolean;
}

export interface BenchEnvironment {
  userAgent: string;
  /** Real device model, platform version and full browser version (Chromium only; the UA string hides these). */
  uaData: Record<string, unknown> | null;
  hardwareConcurrency: number;
  deviceMemoryGB: number | null;
  crossOriginIsolated: boolean;
  secureContext: boolean;
  language: string;
  screen: { width: number; height: number; devicePixelRatio: number };
  onLine: boolean;
}

export async function collectEnvironment(): Promise<BenchEnvironment> {
  const nav = navigator as NavigatorExtras;
  let uaData: Record<string, unknown> | null = null;
  if (nav.userAgentData) {
    uaData = { brands: nav.userAgentData.brands, mobile: nav.userAgentData.mobile, platform: nav.userAgentData.platform };
    try {
      const high = await nav.userAgentData.getHighEntropyValues?.([
        'model',
        'platformVersion',
        'fullVersionList',
        'architecture',
        'bitness',
      ]);
      if (high) uaData = { ...uaData, ...high };
    } catch {
      // permission policy or unsupported hint: keep the low-entropy values
    }
  }
  return {
    userAgent: navigator.userAgent,
    uaData,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGB: nav.deviceMemory ?? null,
    crossOriginIsolated: self.crossOriginIsolated,
    secureContext: window.isSecureContext,
    language: navigator.language,
    screen: { width: screen.width, height: screen.height, devicePixelRatio: window.devicePixelRatio },
    onLine: navigator.onLine,
  };
}

/** Battery level and charging state where the browser exposes them (Chrome on Android does; Safari/Firefox do not). */
export async function readBattery(): Promise<Battery | null> {
  const nav = navigator as NavigatorExtras;
  if (!nav.getBattery) return null;
  try {
    const b = await nav.getBattery();
    return { level: b.level, charging: b.charging };
  } catch {
    return null;
  }
}
