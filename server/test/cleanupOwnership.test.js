const test = require('node:test');
const assert = require('node:assert/strict');
const { createRetentionService } = require('../services/retention');
const time = new Date('2030-01-10T00:00:00Z');
const old = new Date('2030-01-03T00:00:00Z');
const fresh = new Date('2030-01-03T00:00:00.001Z');
function matches(row, filter) {
 return Object.entries(filter).every(([key, value]) => {
  if (key === '$or') return value.some(v => matches(row, v));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
   if ('$lte' in value) return row[key] <= value.$lte;
   if ('$exists' in value) return (row[key] !== undefined) === value.$exists;
  }
  return row[key] === value;
 });
}
function setup(seed = {}) {
 const models = Object.fromEntries(['Analysis','AgentSession','JD','Resume','Supplement'].map(name => {
  const rows = (seed[name] || []).map(r => ({ createdAt: old, userId: 'u', ...r }));
  return [name, { rows,
   async find(q) { return rows.filter(r => matches(r,q)); },
   async findOne(q) { return rows.find(r => matches(r,q)); },
   async countDocuments(q) { return rows.filter(r => matches(r,q)).length; },
   async deleteOne(q) { const i = rows.findIndex(r => matches(r,q)); if(i < 0) return {deletedCount:0}; rows.splice(i,1); return {deletedCount:1}; },
  }];
 }));
 let fail = false;
 const service = createRetentionService({ ...models, now: () => time, transaction: async fn => {
  const backups = Object.values(models).map(m => [...m.rows]);
  try { const result = await fn(); if(fail) { fail=false; throw Error('injected'); } return result; }
  catch(e) { Object.values(models).forEach((m,i) => m.rows.splice(0,m.rows.length,...backups[i])); throw e; }
 }});
 return { ...models, ...service, failNext() {fail=true;} };
}
for(const type of ['analysis','agent']) test(`exclusive ${type}: deletes results, snapshots and owned inputs; repeat safe`, async () => {
 const db = setup({ [type === 'agent' ? 'AgentSession' : 'Analysis']: [{_id:'t',jdId:'j',resumeId:'r',inputSnapshot:{secret:true}}], JD:[{_id:'j'}],Resume:[{_id:'r'}],Supplement:[{_id:'s',resumeId:'r'}] });
 await db.remove(type,'t','u');
 for(const name of ['Analysis','AgentSession','JD','Resume','Supplement']) assert.equal(db[name].rows.length,0,name);
 assert.deepEqual(await db.remove(type,'t','u'),{deleted:false});
});
test('cross-type shared inputs and supplement stay usable',async () => {
 const db=setup({Analysis:[{_id:'a',jdId:'j',resumeId:'r'}],AgentSession:[{_id:'b',jdId:'j',resumeId:'r',createdAt:fresh}],JD:[{_id:'j'}],Resume:[{_id:'r'}],Supplement:[{_id:'s',resumeId:'r'}]});
 await db.remove('analysis','a','u'); await db.cleanup();
 for(const name of ['AgentSession','JD','Resume','Supplement']) assert.equal(db[name].rows.length,1,name);
});
test('foreign owner requests and mismatched material ownership cannot delete foreign data',async()=>{
 const db=setup({Analysis:[{_id:'a',jdId:'j',resumeId:'r'}],JD:[{_id:'j',userId:'foreign'}],Resume:[{_id:'r',userId:'foreign'}],Supplement:[{_id:'s',resumeId:'r',userId:'foreign'}]});
 assert.deepEqual(await db.remove('analysis','a','foreign'),{deleted:false});
 await db.remove('analysis','a','u');
 for(const name of ['JD','Resume','Supplement']) assert.equal(db[name].rows.length,1);
});
test('expiry boundary, abandoned uploads, TTL orphans and repeated sweep',async()=>{
 const db=setup({Analysis:[{_id:'a'}],AgentSession:[{_id:'b',expiresAt:time}],JD:[{_id:'orphan'},{_id:'fresh',createdAt:fresh}],Resume:[{_id:'ttl-orphan'}],Supplement:[{_id:'s',resumeId:'ttl-orphan'}]});
 await db.cleanup(); await db.cleanup();
 assert.deepEqual(db.JD.rows.map(r=>r._id),['fresh']);
 for(const name of ['Analysis','AgentSession','Resume','Supplement']) assert.equal(db[name].rows.length,0);
});
test('partial failure rolls back deletion and retry converges',async()=>{
 const db=setup({Analysis:[{_id:'a',jdId:'j'}],JD:[{_id:'j'}]});db.failNext();
 await assert.rejects(db.remove('analysis','a','u'));
 assert.equal(db.Analysis.rows.length,1);assert.equal(db.JD.rows.length,1);
 await db.remove('analysis','a','u'); assert.equal(db.JD.rows.length,0);
});
