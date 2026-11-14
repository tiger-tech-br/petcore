import {test} from 'node:test';
import assert from 'node:assert/strict';
import {directDatabaseLockOptions} from '../src/databaseLocks.ts';

test('lock de sessão deriva endpoint direto Neon e mantém validação TLS',()=>{
 const options=directDatabaseLockOptions({DATABASE_URL:'postgresql://role:private-password@ep-example-pooler.c-2.sa-east-1.aws.neon.tech/db?sslmode=require&uselibpqcompat=true'});
 const address=new URL(options.connectionString!);assert.equal(address.hostname,'ep-example.c-2.sa-east-1.aws.neon.tech');assert.equal(address.searchParams.get('sslmode'),'verify-full');assert.equal(address.searchParams.has('uselibpqcompat'),false);assert.deepEqual(options.ssl,{rejectUnauthorized:true});assert.equal(options.max,1);
});
test('URL direta explícita só é aceita para mesmo endpoint, banco e usuário',()=>{
 const base={DATABASE_URL:'postgresql://role:private@ep-example-pooler.c-2.sa-east-1.aws.neon.tech/db'};
 assert.equal(new URL(directDatabaseLockOptions({...base,DATABASE_DIRECT_URL:'postgresql://role:private@ep-example.c-2.sa-east-1.aws.neon.tech/db'}).connectionString!).hostname,'ep-example.c-2.sa-east-1.aws.neon.tech');
 for(const value of ['postgresql://role:private@ep-other.c-2.sa-east-1.aws.neon.tech/db','postgresql://role:private@ep-example.c-2.sa-east-1.aws.neon.tech/other','postgresql://other:private@ep-example.c-2.sa-east-1.aws.neon.tech/db']){
  assert.throws(()=>directDatabaseLockOptions({...base,DATABASE_DIRECT_URL:value}),{code:'DATABASE_LOCK_TARGET_MISMATCH'});
 }
});
test('teste local não herda URL de produção nem conecta em banco diferente',()=>{
 const base={NODE_ENV:'test',DATABASE_URL:'postgresql://postgres@127.0.0.1:25469/locks_test',TEST_DATABASE_URL:'postgresql://postgres@127.0.0.1:25469/locks_test'};
 const options=directDatabaseLockOptions(base);assert.equal(new URL(options.connectionString!).hostname,'127.0.0.1');assert.equal(options.ssl,undefined);
 assert.throws(()=>directDatabaseLockOptions({...base,DATABASE_DIRECT_URL:'postgresql://role:secret@ep-real.neon.tech/neondb'}),{code:'DATABASE_LOCK_TARGET_MISMATCH'});
 assert.throws(()=>directDatabaseLockOptions({...base,TEST_DATABASE_URL:'postgresql://postgres@127.0.0.1:25469/other_test'}),{code:'DATABASE_LOCK_TEST_TARGET_MISMATCH'});
 assert.throws(()=>directDatabaseLockOptions({...base,DATABASE_URL:'postgresql://postgres@127.0.0.1:25469/not_testing',TEST_DATABASE_URL:undefined}),{code:'DATABASE_LOCK_TEST_DATABASE_REQUIRED'});
});
test('erros de configuração não incluem credencial e pooler desconhecido é recusado',()=>{
 for(const value of ['', 'not-a-url', 'https://private-password@example.test/db']){
  assert.throws(()=>directDatabaseLockOptions({DATABASE_URL:value}),error=>{assert.doesNotMatch(String(error),/private-password|example\.test/);return (error as {code?:string}).code==='DATABASE_LOCK_URL_INVALID';});
 }
 assert.throws(()=>directDatabaseLockOptions({DATABASE_URL:'postgresql://role:secret@pooler.example.test/db'}),{code:'DATABASE_LOCK_DIRECT_CONNECTION_REQUIRED'});
});
