(function () {
  const QUEUE_KEY = 'eac_offline_queue_v1';
  const DEVICE_ID_KEY = 'eac_device_id_v1';

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  };

  const getDeviceId = () => {
    let id = readJson(DEVICE_ID_KEY, null);
    if (id) return id;
    id = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : 'device-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    writeJson(DEVICE_ID_KEY, id);
    return id;
  };

  const getSnapshotPayload = () => {
    const raw = localStorage.getItem('eac_dashboard_data_v1');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? { ...parsed, __meta: { updatedAt: Date.now() } } : null;
    } catch (e) {
      return null;
    }
  };

  const queueSnapshot = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const queued = readJson(QUEUE_KEY, []);
    const item = {
      id: (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'sync-' + Date.now() + '-' + Math.random().toString(16).slice(2),
      createdAt: Date.now(),
      deviceId: getDeviceId(),
      payload: {
        ...payload,
        __meta: { ...(payload.__meta || {}), updatedAt: payload.__meta?.updatedAt || Date.now(), source: 'dashboard' }
      }
    };
    queued.push(item);
    writeJson(QUEUE_KEY, queued);
    return item;
  };

  const flushQueue = async () => {
    if (!window.eacSupabase || !navigator.onLine) return false;

    const { data: sessionData } = await window.eacSupabase.auth.getSession();
    if (!sessionData?.session) return false;

    const queue = readJson(QUEUE_KEY, []);
    if (!queue.length) return true;

    const remaining = [];
    for (const item of queue) {
      try {
        const { error } = await window.eacSupabase
          .from('sync_snapshots')
          .insert({
            kind: 'dashboard',
            device_id: item.deviceId || getDeviceId(),
            payload: item.payload
          });

        if (error) {
          remaining.push(item);
          continue;
        }
      } catch (e) {
        remaining.push(item);
      }
    }

    if (remaining.length !== queue.length) {
      writeJson(QUEUE_KEY, remaining);
      return remaining.length === 0;
    }

    return false;
  };

  const syncLatestRemoteSnapshot = async () => {
    if (!window.eacSupabase || !navigator.onLine) return null;

    const { data: sessionData } = await window.eacSupabase.auth.getSession();
    if (!sessionData?.session) return null;

    const { data, error } = await window.eacSupabase
      .from('sync_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data || !data.length) return null;

    const latest = data[0];
    const remotePayload = latest.payload || null;
    if (!remotePayload) return null;

    const localRaw = localStorage.getItem('eac_dashboard_data_v1');
    let localPayload = null;
    try { localPayload = localRaw ? JSON.parse(localRaw) : null; } catch (e) { localPayload = null; }

    const localTs = localPayload && localPayload.__meta ? Number(localPayload.__meta.updatedAt || 0) : 0;
    const remoteTs = remotePayload.__meta ? Number(remotePayload.__meta.updatedAt || 0) : new Date(latest.created_at || Date.now()).getTime();

    if (remoteTs > localTs) {
      localStorage.setItem('eac_dashboard_data_v1', JSON.stringify(remotePayload));
      return remotePayload;
    }

    return null;
  };

  const install = ({ onRemoteSnapshot } = {}) => {
    const applyIfNeeded = async () => {
      if (!window.eacSupabase) return;
      try {
        const remote = await syncLatestRemoteSnapshot();
        if (remote && typeof onRemoteSnapshot === 'function') {
          onRemoteSnapshot(remote);
        }
      } catch (e) {
        // no-op; the app remains usable offline.
      }
    };

    window.addEventListener('online', () => {
      queueMicrotask(() => flushQueue().then(() => applyIfNeeded()));
    });

    window.addEventListener('DOMContentLoaded', () => {
      queueMicrotask(() => flushQueue().then(() => applyIfNeeded()));
    });

    setTimeout(() => {
      flushQueue().then(() => applyIfNeeded());
    }, 250);

    return {
      flushQueue,
      syncLatestRemoteSnapshot,
      queueSnapshot,
      getSnapshotPayload
    };
  };

  window.eacOfflineSync = {
    install,
    flushQueue,
    syncLatestRemoteSnapshot,
    queueSnapshot,
    getSnapshotPayload,
    getDeviceId
  };
})();
