(function () {
  const QUEUE_KEY = 'eac_offline_queue_v1';
  const DEVICE_ID_KEY = 'eac_device_id_v1';
  const EXTRA_STORES = {
    invoiceHistory: 'eac_invoice_history_v1',
    invoiceCustomers: 'eac_invoice_customers_v1',
    invoiceDescriptions: 'eac_invoice_descriptions_v1',
    invoiceTeamMember: 'eac_invoice_team_member_v1',
    invoiceSequence: 'eac_invoice_next_seq_v1',
    materialsReceipts: 'eac_materials_receipts_v1'
  };

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

  const getExtraStores = () => Object.keys(EXTRA_STORES).reduce((extras, name) => {
    const raw = localStorage.getItem(EXTRA_STORES[name]);
    if (!raw) return extras;
    try { extras[name] = JSON.parse(raw); } catch (e) { extras[name] = raw; }
    return extras;
  }, {});

  const restoreExtraStores = (payload) => {
    Object.keys(EXTRA_STORES).forEach(name => {
      if (payload[name] === undefined) return;
      writeJson(EXTRA_STORES[name], payload[name]);
    });
  };

  const queueSnapshot = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const queued = readJson(QUEUE_KEY, []);
    const deviceId = getDeviceId();
    const dashboard = readJson('eac_dashboard_data_v1', {});
    const item = {
      id: (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'sync-' + Date.now() + '-' + Math.random().toString(16).slice(2),
      createdAt: Date.now(),
      deviceId,
      payload: {
        ...dashboard,
        ...payload,
        ...getExtraStores(),
        __meta: { ...(payload.__meta || {}), updatedAt: payload.__meta?.updatedAt || Date.now(), source: 'dashboard' }
      }
    };
    const compactedQueue = queued.filter(existing => existing.deviceId !== deviceId);
    compactedQueue.push(item);
    writeJson(QUEUE_KEY, compactedQueue);
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

    if (readJson(QUEUE_KEY, []).length) return null;

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
      restoreExtraStores(remotePayload);
      localStorage.setItem('eac_dashboard_data_v1', JSON.stringify(remotePayload));
      return remotePayload;
    }

    return null;
  };

  const install = ({ onRemoteSnapshot } = {}) => {
    let syncInFlight = null;
    let realtimeChannel = null;
    const applyRemotePayload = (remotePayload, createdAt) => {
      if (!remotePayload || typeof remotePayload !== 'object' || readJson(QUEUE_KEY, []).length) return;
      const localPayload = readJson('eac_dashboard_data_v1', {});
      const localTs = Number(localPayload.__meta?.updatedAt || 0);
      const remoteTs = Number(remotePayload.__meta?.updatedAt || new Date(createdAt || Date.now()).getTime());
      if (remoteTs <= localTs) return;
      restoreExtraStores(remotePayload);
      writeJson('eac_dashboard_data_v1', remotePayload);
      if (typeof onRemoteSnapshot === 'function') onRemoteSnapshot(remotePayload);
    };

    const connectRealtime = async () => {
      if (!window.eacSupabase || realtimeChannel) return;
      const { data: sessionData } = await window.eacSupabase.auth.getSession();
      if (!sessionData?.session) return;
      if (window.eacSupabase.realtime && window.eacSupabase.realtime.setAuth) {
        await window.eacSupabase.realtime.setAuth(sessionData.session.access_token);
      }
      realtimeChannel = window.eacSupabase
        .channel('eac-sync-snapshots')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sync_snapshots' }, (event) => {
          const row = event.new || {};
          if (row.kind === 'dashboard') applyRemotePayload(row.payload, row.created_at);
        })
        .subscribe();
    };

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

    const syncNow = () => {
      if (syncInFlight) return syncInFlight;
      syncInFlight = flushQueue()
        .then(() => connectRealtime())
        .then(() => applyIfNeeded())
        .finally(() => { syncInFlight = null; });
      return syncInFlight;
    };

    window.addEventListener('online', () => {
      queueMicrotask(syncNow);
    });

    window.addEventListener('DOMContentLoaded', () => {
      queueMicrotask(syncNow);
    });

    const retryTimer = setInterval(syncNow, 30000);
    setTimeout(syncNow, 250);

    return {
      flushQueue,
      syncLatestRemoteSnapshot,
      syncNow,
      queueSnapshot,
      getSnapshotPayload,
      stop: () => {
        clearInterval(retryTimer);
        if (realtimeChannel) window.eacSupabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
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
