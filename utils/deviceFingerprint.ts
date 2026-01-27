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
    } else {
      return 'web';
    }
  } catch (error) {
    // If Device API fails, we're likely on web, but we can still check the platform from UA
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
  
  // Extract OS
  if (ua.includes('Windows')) {
    info.os = 'Windows';
  } else if (ua.includes('Mac')) {
    info.os = 'macOS';
  } else if (ua.includes('Linux')) {
    info.os = 'Linux';
  } else if (ua.includes('Android')) {
    info.os = 'Android';
  } else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) {
    info.os = 'iOS';
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
  
  if (deviceType === 'web') {
    return generateWebFingerprint();
  } else {
    // For mobile, use the UUID from Capacitor
    try {
      const id = await Device.getId();
      return id.identifier || generateFallbackFingerprint();
    } catch (error) {
      console.error('Error getting device ID:', error);
      return generateFallbackFingerprint();
    }
  }
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
  } else if (deviceType === 'android') {
    const model = info.deviceModel || 'Android Device';
    return model;
  } else if (deviceType === 'ios') {
    const model = info.deviceModel || 'iOS Device';
    return model;
  }
  
  return 'Unknown Device';
}
