const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { service, createWithInputs } = require('../services/retention');
const Analysis = require('../models/Analysis');
const AgentSession = require('../models/AgentSession');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
test('isolated replica set: transactions, reference races, rollback, TTL and no resurrection', {skip: !process.env.RUN_RETENTION_MONGO}, async()=>{
 const { MongoMemoryReplSet } = require('../../.retention-test/node_modules/mongodb-memory-server');
 const repl = await MongoMemoryReplSet.create({replSet:{count:1},instanceOpts:[{args:['--setParameter','ttlMonitorSleepSecs=1']}]});
 try {
  await mongoose.connect(repl.getUri(),{dbName:'vitafix_retention_synthetic'});
  await Promise.all([Analysis.init(),AgentSession.init(),JD.init(),Resume.init(),Supplement.init()]);
  const j=await JD.create({userId:'synthetic',rawText:'synthetic JD'});
  const r=await Resume.create({userId:'synthetic',rawText:'synthetic resume'});
  await Supplement.create({userId:'synthetic',resumeId:r._id,items:[]});
  const make=()=>createWithInputs({userId:'synthetic',jdId:j._id,resumeId:r._id},()=>Analysis.create({userId:'synthetic',jdId:j._id,resumeId:r._id}));
  const a=await make(); const b=await make();
  await assert.rejects(mongoose.connection.transaction(async()=>{
    await Analysis.deleteOne({_id:a._id,userId:'synthetic'});
    throw Error('injected rollback');
  }));
  assert.ok(await Analysis.findById(a._id));
  await service().remove('analysis',a._id,'synthetic'); assert.ok(await Resume.findById(r._id));
  const outcomes=await Promise.allSettled([make(),service().remove('analysis',b._id,'synthetic')]);
  const remaining=await Analysis.find({userId:'synthetic'});
  for(const row of remaining) { assert.ok(await Resume.findById(row.resumeId)); await service().remove('analysis',row._id,'synthetic'); }
  assert.equal(await Resume.countDocuments({}),0);
  await Analysis.updateOne({_id:a._id,userId:'synthetic'},{$set:{status:'completed'}});
  assert.equal(await Analysis.countDocuments({}),0);
  const orphan=await Resume.create({userId:'synthetic',rawText:'TTL orphan',createdAt:new Date(Date.now()-8*86400000)});
  const session=await AgentSession.create({userId:'synthetic',resumeId:orphan._id,expiresAt:new Date(Date.now()-1000)});
  const indexes=await AgentSession.collection.indexes(); assert.ok(indexes.some(i=>i.expireAfterSeconds===0));
  for(let i=0;i<100 && await AgentSession.exists({_id:session._id});i++) await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await AgentSession.exists({_id:session._id}),null);
  await service().cleanup(); assert.equal(await Resume.findById(orphan._id),null);
  assert.equal(outcomes.length,2);
 } finally { await mongoose.disconnect(); await repl.stop(); }
});
