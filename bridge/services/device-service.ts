import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';

export interface DeviceDescriptor {
  deviceId: string;
  deviceName: string;
}

/**
 * Replaces the Cordova `window.device` global (cordova-plugin-device).
 * Populates `window.device` with the same shape the web app expects
 * (platform, uuid, model, manufacturer, version) so existing code keeps working.
 */
export async function populateDeviceGlobal(): Promise<DeviceDescriptor> {
  const info = await Device.getInfo();
  const id = await Device.getId();

  // Cordova used 'iOS' / 'Android'; Capacitor uses 'ios' / 'android'.
  const platform = info.platform === 'ios' ? 'iOS' : info.platform === 'android' ? 'Android' : info.platform;

  const uuid = id.identifier;

  window.device = {
    platform,
    uuid,
    model: info.model,
    manufacturer: info.manufacturer,
    version: info.osVersion,
  };

  return {
    deviceId: uuid,
    deviceName: `${info.manufacturer} ${info.model} (${platform})`,
  };
}

export function getPlatform(): string {
  return Capacitor.getPlatform();
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
