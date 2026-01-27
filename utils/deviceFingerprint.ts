/**
 * Device Fingerprinting Utility
 * 
 * Generates unique device identifiers for tracking and authentication purposes.
 * - For Web: Creates fingerprint based on browser characteristics
 * - For Mobile (Android/iOS): Uses Capacitor Device API to get unique device ID
 */

import { Device } from '@capacitor/device';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { DeviceInfo, DeviceType } from '../types';

/**
 * Detect the current platform type
 */
export async function detectDeviceType(): Promise<DeviceType> {
  try {
    const info = await Device.getInfo();
    
    if (info.platform === 'android') {
      return 'android';
    } else if (info.platform === 'ios') {
      return 'ios';
    }
    
    // Fallback check: Some "converted" apps might report 'web' platform 
    // but the User Agent clearly says they are mobile.
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) return 'android';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
    
    return 'web';
  } catch (error) {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) return 'android';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
    return 'web';
  }
}

/**
 * Get comprehensive device information
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const deviceType = await detectDeviceType();
  
  if (deviceType === 'web') {
    return await getWebDeviceInfo();
  } else {
    return await getMobileDeviceInfo();
  }
}

/**
 * Get device information for mobile platforms using Capacitor
 */
async function getMobileDeviceInfo(): Promise<DeviceInfo> {
  try {
    const info = await Device.getInfo();
    const id = await Device.getId();
    const battery = await Device.getBatteryInfo();
    const network = await Network.getStatus();
    let appInfo: any = {};
    try {
      appInfo = await App.getInfo();
    } catch (e) {}
    
    const deviceInfo: DeviceInfo = {
      platform: info.platform,
      os: info.operatingSystem,
      osVersion: info.osVersion,
      deviceModel: info.model,
      manufacturer: info.manufacturer,
      uuid: id.identifier,
      androidId: info.platform === 'android' ? id.identifier : undefined,
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      batteryLevel: battery.batteryLevel,
      isCharging: battery.isCharging,
      connectionType: network.connectionType,
      appVersion: appInfo.version || 'unknown',
    };

    // Try to get public IP for mobile too
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      if (data.ip) deviceInfo.ipAddress = data.ip;
    } catch (e) {}

    return deviceInfo;
  } catch (error) {
    console.error('Error getting mobile device info:', error);
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
    };
  }
}

/**
 * Get device information for web platform
 */
async function getWebDeviceInfo(): Promise<DeviceInfo> {
  const info: DeviceInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    colorDepth: window.screen.colorDepth,
  };
  
  // Parse user agent for browser/OS info
  const ua = navigator.userAgent;
  
  // Extract browser name and version
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    info.browser = 'Chrome';
    const match = ua.match(/Chrome\/([\d.]+)/);
    if (match) info.browserVersion = match[1];
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    info.browser = 'Safari';
    const match = ua.match(/Version\/([\d.]+)/);
    if (match) info.browserVersion = match[1];
  } else if (ua.includes('Firefox')) {
    info.browser = 'Firefox';
    const match = ua.match(/Firefox\/([\d.]+)/);
    if (match) info.browserVersion = match[1];
  } else if (ua.includes('Edg')) {
    info.browser = 'Edge';
    const match = ua.match(/Edg\/([\d.]+)/);
    if (match) info.browserVersion = match[1];
  }
  
  // Extract OS - PRIORITIZE MOBILE (Android/iOS) over Generic (Linux/Mac)
  if (ua.includes('Android')) {
    info.os = 'Android';
  } else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) {
    info.os = 'iOS';
  } else if (ua.includes('Windows') || navigator.platform.includes('Win')) {
    info.os = 'Windows';
  } else if (ua.includes('Mac') || navigator.platform.includes('Mac')) {
    info.os = 'macOS';
  } else if (ua.includes('Linux') || navigator.platform.includes('Linux')) {
    info.os = 'Linux';
  }

  // Use User-Agent Client Hints for more specific hardware info (Chrome/Edge/Opera)
  // This is the "Alternative idea" to get more specific hardware data
  if ((navigator as any).userAgentData && typeof (navigator as any).userAgentData.getHighEntropyValues === 'function') {
    try {
      const highEntropy = await (navigator as any).userAgentData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList', 'architecture']);
      if (highEntropy.model) info.deviceModel = highEntropy.model;
      if (highEntropy.architecture) info.platform = `${highEntropy.architecture} architecture`;
      
      // Some browsers might provide manufacturer in some hints but it's less standard
      // We can infer manufacturer for Apple/Windows based on hints
      if (info.os === 'macOS' || info.os === 'iOS') info.manufacturer = 'Apple';
      if (info.os === 'Windows') {
         // On Windows, the model field often contains the device name if set
      }
    } catch (e) {
      console.warn('Could not get high entropy hints', e);
    }
  }
  
  // Get available fonts (limited sample for fingerprinting)
  info.fonts = getAvailableFonts();
  
  // Get plugins
  info.plugins = Array.from(navigator.plugins || []).map(p => p.name);
  
  // Canvas fingerprint
  info.canvas = getCanvasFingerprint();
  
  // WebGL fingerprint
  info.webgl = getWebGLFingerprint();

  // Try to get public IP
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    if (data.ip) info.ipAddress = data.ip;
  } catch (e) {}
  
  return info;
}

/**
 * Generate a unique device identifier
 */
export async function generateDeviceIdentifier(): Promise<string> {
  const deviceType = await detectDeviceType();
  const PERSISTENT_ID_KEY = 'paradigm_device_id';
  
  // 1. Try to get from Capacitor Preferences (most stable for hybrid/native)
  try {
    const { value: storedId } = await Preferences.get({ key: PERSISTENT_ID_KEY });
    if (storedId) {
      return storedId.toLowerCase();
    }
  } catch (e) {
    console.error('Error reading from Preferences:', e);
  }

  // 2. Fallback to localStorage (and migrate to Preferences if found)
  const localId = localStorage.getItem(PERSISTENT_ID_KEY);
  if (localId) {
    const normalized = localId.toLowerCase();
    try {
      await Preferences.set({ key: PERSISTENT_ID_KEY, value: normalized });
    } catch (e) {}
    return normalized;
  }

  // 3. For mobile, try native hardware ID if nothing stored
  if (deviceType !== 'web') {
    try {
      const id = await Device.getId();
      if (id.identifier) {
        const nativeId = id.identifier.toLowerCase();
        await Preferences.set({ key: PERSISTENT_ID_KEY, value: nativeId });
        return nativeId;
      }
    } catch (e) {}
  }

  // 4. Generate new fingerprint as last resort
  const newId = generateWebFingerprint().toLowerCase();
  try {
    await Preferences.set({ key: PERSISTENT_ID_KEY, value: newId });
  } catch (e) {}
  localStorage.setItem(PERSISTENT_ID_KEY, newId);
  return newId;
}

/**
 * Generate web browser fingerprint
 */
function generateWebFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    String(window.screen.width),
    String(window.screen.height),
    String(window.screen.colorDepth),
    new Date().getTimezoneOffset(),
    getCanvasFingerprint(),
    getWebGLFingerprint(),
    getAvailableFonts().join(','),
    Array.from(navigator.plugins || []).map(p => p.name).join(','),
  ];
  
  return hashString(components.join('|'));
}

/**
 * Generate fallback fingerprint when other methods fail
 */
function generateFallbackFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    String(window.screen.width),
    String(window.screen.height),
    String(new Date().getTimezoneOffset()),
  ];
  
  return hashString(components.join('|'));
}

/**
 * Get canvas fingerprint
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    const text = 'Paradigm Device Fingerprint 🔒';
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText(text, 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText(text, 4, 17);
    
    return canvas.toDataURL().substring(0, 50);
  } catch (error) {
    return '';
  }
}

/**
 * Get WebGL fingerprint
 */
function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext;
    if (!gl) return '';
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return '';
    
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    return `${vendor}|${renderer}`.substring(0, 50);
  } catch (error) {
    return '';
  }
}

/**
 * Get list of available fonts (sample)
 */
function getAvailableFonts(): string[] {
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const testFonts = [
    'Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia',
    'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS',
    'Impact', 'Lucida Console'
  ];
  
  const available: string[] = [];
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return available;
  
  for (const font of testFonts) {
    let detected = false;
    for (const baseFont of baseFonts) {
      ctx.font = `12px "${font}", ${baseFont}`;
      const width = ctx.measureText('mmmmmmmmmmlli').width;
      
      ctx.font = `12px ${baseFont}`;
      const baseWidth = ctx.measureText('mmmmmmmmmmlli').width;
      
      if (width !== baseWidth) {
        detected = true;
        break;
      }
    }
    if (detected) {
      available.push(font);
    }
  }
  
  return available;
}

/**
 * Simple hash function for strings
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate a user-friendly device name
 */
export async function generateDeviceName(): Promise<string> {
  const deviceType = await detectDeviceType();
  const info = await getDeviceInfo();
  
  if (deviceType === 'web') {
    const browser = info.browser || 'Browser';
    const os = info.os || info.platform || 'Unknown OS';
    return `${browser} on ${os}`;
  } else {
    // Clean up mobile names (avoid messy UserAgent strings in titles)
    let model = info.deviceModel || '';
    let manufacturer = info.manufacturer || '';

    // Sanitize manufacturer: if it's bogus or generic, clear it
    if (manufacturer.includes('Mozilla') || manufacturer.includes('Google Inc') || manufacturer.toLowerCase().includes('unknown')) {
       manufacturer = '';
    }

    // Sanitize model: if it's too long or looks like a UA string, clear it
    if (model.includes('Mozilla') || model.length > 25 || model.toLowerCase().includes('unknown')) {
       model = '';
    }

    // Build friendly name
    if (model && manufacturer) return `${manufacturer} ${model}`;
    if (model) return model;
    if (manufacturer) return `${manufacturer} ${deviceType === 'android' ? 'Android' : 'iOS'}`;
    
    return deviceType === 'android' ? 'Android Device' : 'iOS Device';
  }
}
