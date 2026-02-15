/**
 * Test setup — mock chrome extension APIs.
 * These don't exist in Node/jsdom, so we stub them.
 */

// Minimal chrome.storage mock
const storage: Record<string, any> = {};
const listeners: Array<(changes: any, area: string) => void> = [];

(globalThis as any).chrome = {
  storage: {
    local: {
      get: (keys: string | string[], cb?: (data: any) => void) => {
        const result: any = {};
        const keyList = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        for (const k of keyList) {
          if (k in storage) result[k] = storage[k];
        }
        if (cb) {
          cb(result);
          return undefined;
        }
        // MV3 Promise form (no callback)
        return Promise.resolve(result);
      },
      set: (data: any, cb?: () => void) => {
        Object.assign(storage, data);
        if (cb) { cb(); return undefined; }
        return Promise.resolve();
      },
      remove: (key: string, cb?: () => void) => {
        delete storage[key];
        cb?.();
      },
    },
    onChanged: {
      addListener: (fn: any) => listeners.push(fn),
      removeListener: (fn: any) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    },
  },
  runtime: {
    sendMessage: (_msg: any, _cb?: any) => {},
    onMessage: {
      addListener: (_fn: any) => {},
      removeListener: (_fn: any) => {},
    },
    getManifest: () => ({ content_scripts: [] }),
    lastError: null,
  },
  tabs: {
    query: (_opts: any, cb: (tabs: any[]) => void) => cb([]),
    sendMessage: (_tabId: any, _msg: any, _cb?: any) => {},
    onUpdated: { addListener: (_fn: any) => {} },
  },
  action: {
    setBadgeText: (_opts: any) => {},
    setBadgeBackgroundColor: (_opts: any) => {},
  },
  sidePanel: { setPanelBehavior: (_opts: any) => {}, open: (_opts: any) => {} },
  contextMenus: { create: (_opts: any) => {}, onClicked: { addListener: (_fn: any) => {} } },
  alarms: { create: (_name: any, _opts: any) => {}, onAlarm: { addListener: (_fn: any) => {} } },
  scripting: { executeScript: async (_opts: any) => {} },
};
