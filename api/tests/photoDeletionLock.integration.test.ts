import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {S3Client} from '@aws-sdk/client-s3';
import {PHOTO_BACKUP_LOCK} from '../src/photoBackup.ts';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Configure TEST_DATABASE_URL exclusivo terminado em _test.');
Object.assign(process.env,{DATABASE_URL:testUrl,NODE_ENV:'test',SESSION_SECRET:'photo-lock-isolated-'+randomUUID()+randomUUID(),OBJECT_STORAGE_ENDPOINT:'https://photos.example.test',OBJECT_STORAGE_BUCKET:'fake-photo-lock',OBJECT_STORAGE_ACCESS_KEY:'fake-access',OBJECT_STORAGE_SECRET_KEY:'fake-secret'});
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
const {pool}=await import('../src/core.js');
const {processObjectDeletionJobs}=await import('../src/privacyService.js');

test('exclusão de fotos adia lote enquanto backup ou exportação protege seu snapshot',async()=>{
 const guard=await pool.connect(),original=S3Client.prototype.send;let networkCalls=0;
 S3Client.prototype.send=(async()=>{networkCalls++;throw Error('No external storage access is permitted in this isolated test');}) as typeof original;
 try{
  await guard.query('SELECT pg_advisory_lock_shared($1)',[PHOTO_BACKUP_LOCK]);
  const deferred=await processObjectDeletionJobs({tenantId:randomUUID()});assert.deepEqual(deferred,{processed:0,completed:0,failed:0,deferred:true});
  await guard.query('SELECT pg_advisory_unlock_shared($1)',[PHOTO_BACKUP_LOCK]);
  const empty=await processObjectDeletionJobs({tenantId:randomUUID()});assert.deepEqual(empty,{processed:0,completed:0,failed:0});assert.equal(networkCalls,0);
 }finally{
  S3Client.prototype.send=original;await guard.query('SELECT pg_advisory_unlock_shared($1)',[PHOTO_BACKUP_LOCK]).catch(()=>{});guard.release();await pool.end();
 }
});
