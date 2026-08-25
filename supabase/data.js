(function () {
  function client() {
    if (!window.eacSupabase) throw new Error('Supabase is not configured.');
    return window.eacSupabase;
  }

  async function readTable(table, orderColumn) {
    const query = client().from(table).select('*').is('cancelled_at', null);
    const { data, error } = await query.order(orderColumn || 'created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function createRecord(table, record) {
    const { data, error } = await client().from(table).insert(record).select().single();
    if (error) throw error;
    return data;
  }

  async function updateRecord(table, id, changes, version) {
    const query = client().from(table).update({ ...changes, version: Number(version) + 1 }).eq('id', id).eq('version', version).select().single();
    const { data, error } = await query;
    if (error) throw error;
    if (!data) throw new Error('This record was changed by another user. Reload and reapply your changes.');
    return data;
  }

  async function cancelRecord(table, id, userId) {
    const { data, error } = await client().from(table).update({ cancelled_at: new Date().toISOString(), cancelled_by: userId }).eq('id', id).is('cancelled_at', null).select().single();
    if (error) throw error;
    return data;
  }

  window.eacData = {
    readShipments: function () { return readTable('shipments', 'date'); },
    readCollections: function () { return readTable('collections', 'date'); },
    readOrders: function () { return readTable('orders', 'date'); },
    createRecord: createRecord,
    updateRecord: updateRecord,
    cancelRecord: cancelRecord
  };
})();
