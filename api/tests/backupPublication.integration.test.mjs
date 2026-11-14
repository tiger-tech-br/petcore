import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {S3Client} from '@aws-sdk/client-s3';
import {FakeObjectStore} from './helpers/fakePhotoStorage.ts';

const testAddress=new URL(process.env.TEST_DATABASE_URL||'postgresql://invalid/missing');
assert.ok(['127.0.0.1','localhost'].includes(testAddress.hostname),'Use only a loopback test database.');
assert.ok(decodeURIComponent(testAddress.pathname).endsWith('_test'),'Use only a dedicated test database.');
assert.ok(testAddress.port,'Set the explicit local PostgreSQL port.');
const configuredNames=['DATABASE_URL','DATABASE_DIRECT_URL','DATABASE_SSL','NODE_ENV','BACKUP_ENCRYPTION_KEY','BACKUP_KEY_ID','BACKUP_STORAGE_ENDPOINT','BACKUP_STORAGE_BUCKET','BACKUP_STORAGE_REGION','BACKUP_STORAGE_ACCESS_KEY','BACKUP_STORAGE_SECRET_KEY','BACKUP_STORAGE_PREFIX','OBJECT_STORAGE_ENDPOINT','OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_REGION','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY'];
const configured=Object.fromEntries(configuredNames.map(name=>[name,process.env[name]]));
Object.assign(process.env,{DATABASE_URL:testAddress.toString(),DATABASE_DIRECT_URL:testAddress.toString(),DATABASE_SSL:'false',NODE_ENV:'test',BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('hex'),BACKUP_KEY_ID:'isolated-publication-test',BACKUP_STORAGE_ENDPOINT:'https://storage.example.test',BACKUP_STORAGE_BUCKET:'fake-backups',BACKUP_STORAGE_REGION:'auto',BACKUP_STORAGE_ACCESS_KEY:'fake-backup-access',BACKUP_STORAGE_SECRET_KEY:'fake-backup-secret',BACKUP_STORAGE_PREFIX:'publication-test',OBJECT_STORAGE_ENDPOINT:'https://storage.example.test',OBJECT_STORAGE_BUCKET:'fake-photos',OBJECT_STORAGE_REGION:'auto',OBJECT_STORAGE_ACCESS_KEY:'fake-photo-access',OBJECT_STORAGE_SECRET_KEY:'fake-photo-secret'});
const {runBackup,databaseAddress}=await import('../scripts/backup.mjs');

test('scripts derivam Neon direto e recusam outros poolers sem restringir o banco de recuperação',()=>{
 const neon=databaseAddress('postgresql://role:private@ep-example-pooler.c-2.sa-east-1.aws.neon.tech/source');
 assert.equal(neon.hostname,'ep-example.c-2.sa-east-1.aws.neon.tech');assert.equal(neon.searchParams.get('sslmode'),'verify-full');
 for(const value of ['postgresql://role:private@pooler.example.test/source','postgresql://role:private@pg.example.test:6432/source','postgresql://role:private@ep-example-pooler.c-2.sa-east-1.aws.neon.tech:6432/source']){
  assert.throws(()=>databaseAddress(value),error=>{assert.doesNotMatch(String(error),/private|example\.test/);return error.code==='BACKUP_DIRECT_CONNECTION_REQUIRED';});
 }
 const recovery=databaseAddress('postgresql://different:private@restore.example.test:5433/new_restore_test');
 assert.equal(recovery.hostname,'restore.example.test');assert.equal(recovery.pathname,'/new_restore_test');assert.equal(recovery.port,'5433');
});

test('ack perdido após publicar preserva estado uploaded e todos os objetos cifrados',async()=>{
 const tenantId=randomUUID(),petId=randomUUID(),photoKey=`tenants/${tenantId}/pets/${petId}/${randomUUID()}.webp`;
 const photos=new FakeObjectStore(),backups=new FakeObjectStore();photos.objects.set(photoKey,Buffer.from('isolated fictitious photo'));
 const originalQuery=pg.Client.prototype.query,originalSend=S3Client.prototype.send,originalError=console.error,originalLog=console.log;
 const messages=[];let backupId,publishedSha,failedUpdates=0;
 const observer=new pg.Pool({connectionString:testAddress.toString(),max:1,ssl:false});
 try{
  S3Client.prototype.send=async function(command){
   assert.ok(['fake-backups','fake-photos'].includes(command.input.Bucket),'No real storage destination is allowed.');
   return (command.input.Bucket==='fake-backups'?backups:photos).send(command);
  };
  pg.Client.prototype.query=function(text,values,...rest){
   if(typeof text==='string'&&text.startsWith('SELECT tenant_id,id,photo_key FROM pets WHERE photo_key IS NOT NULL'))return Promise.resolve({rows:[{tenant_id:tenantId,id:petId,photo_key:photoKey}],rowCount:1});
   if(typeof text==='string'&&text.startsWith('INSERT INTO backup_runs(id,state)'))backupId=values[0];
   if(typeof text==='string'&&text.startsWith("UPDATE backup_runs SET state='failed'"))failedUpdates++;
   const result=originalQuery.call(this,text,values,...rest);
   if(typeof text==='string'&&text.startsWith("UPDATE backup_runs SET state='uploaded'")){
    publishedSha=values[2];
    return result.then(committed=>{
     assert.equal(committed.rowCount,1);
     this.emit('error',Object.assign(new Error('Isolated acknowledgement loss'),{code:'ECONNRESET'}));
     throw Object.assign(new Error('Isolated acknowledgement loss'),{code:'ECONNRESET'});
    });
   }
   return result;
  };
  console.error=value=>messages.push(String(value));console.log=()=>{};
  await assert.rejects(runBackup([]),{code:'BACKUP_PUBLICATION_UNCERTAIN'});
  const row=(await observer.query('SELECT state,sha256 FROM backup_runs WHERE id=$1',[backupId])).rows[0];
  assert.equal(row.state,'uploaded');assert.equal(row.sha256,publishedSha);assert.equal(failedUpdates,0);
  assert.equal(backups.objects.size,4);assert.equal(backups.deletes.length,0);assert.equal(photos.deletes.length,0);assert.ok(photos.objects.has(photoKey));
  const warning=messages.map(value=>JSON.parse(value)).find(value=>value.code==='BACKUP_PUBLICATION_UNCERTAIN');
  assert.equal(warning.backupId,backupId);assert.equal(warning.artifactsPreserved,true);
  assert.ok(!messages.join('\n').includes('fake-backup-secret'));
 }finally{
  pg.Client.prototype.query=originalQuery;S3Client.prototype.send=originalSend;console.error=originalError;console.log=originalLog;
  if(backupId)await observer.query('DELETE FROM backup_runs WHERE id=$1',[backupId]);
  await observer.end();
  for(const name of configuredNames){if(configured[name]===undefined)delete process.env[name];else process.env[name]=configured[name];}
 }
});
