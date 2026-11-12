import {after,test} from 'node:test';
import assert from 'node:assert/strict';

const keys=['DATABASE_URL','SESSION_SECRET','NODE_ENV','EMAIL_PROVIDER','EMAIL_API_KEY','EMAIL_FROM','APP_ORIGIN','SUPPORT_EMAILS_ENABLED','SUPPORT_EMAILS_CONFIRM_SEND'] as const;
const saved=new Map(keys.map(key=>[key,process.env[key]]));
Object.assign(process.env,{DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/unit_test',SESSION_SECRET:'support-unit-fixture-'.repeat(3),NODE_ENV:'test'});
const {isSupportEmailRecipient,supportEmailStatus,processSupportEmails}=await import('../src/supportEmailService.js');
const {pool}=await import('../src/core.js');
after(async()=>{await pool.end();for(const [key,value] of saved){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('endereços fictícios são aceitos para simulação e bloqueados no envio de produção',()=>{
 for(const value of ['fixture@example.com','fixture@sub.example.net','fixture@petcore.test','fixture@invalid','fixture@localhost','fixture@sub.example']){
  assert.equal(isSupportEmailRecipient(value,true),false,value);
 }
 assert.equal(isSupportEmailRecipient('fixture@petcore.example',false),true);
 assert.equal(isSupportEmailRecipient('tigertechbr@outlook.com',true),true);
 for(const value of ['bad','user@example.com\r\nBcc: other@outlook.com','<user@outlook.com>','user@outlook.com,user2@outlook.com'])assert.equal(isSupportEmailRecipient(value,false),false);
});
test('envio depende de duas autorizações explícitas e revela somente códigos de configuração',()=>{
 Object.assign(process.env,{EMAIL_PROVIDER:'resend',EMAIL_API_KEY:'fixture-secret',EMAIL_FROM:'PetCore <fixture@petcore.example>',APP_ORIGIN:'https://petcore.example',SUPPORT_EMAILS_ENABLED:'true',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});
 assert.deepEqual(supportEmailStatus(),{enabled:false,configured:true,errorCode:null});
 process.env.SUPPORT_EMAILS_CONFIRM_SEND='YES';assert.equal(supportEmailStatus().enabled,true);
 process.env.EMAIL_FROM='PetCore <fixture@petcore.example>\r\nBcc: user@outlook.com';assert.deepEqual(supportEmailStatus(),{enabled:true,configured:false,errorCode:'EMAIL_CONFIG_INVALID'});
 assert.doesNotMatch(JSON.stringify(supportEmailStatus()),/fixture-secret|Bcc/);
 process.env.EMAIL_FROM='PetCore <fixture@petcore.example>';
 for(const value of ['http://petcore.example','https://user:secret@petcore.example','https://petcore.example/path','https://petcore.example/?token=secret']){process.env.APP_ORIGIN=value;assert.equal(supportEmailStatus().errorCode,'EMAIL_ORIGIN_INVALID');}
});
test('desabilitado não tenta acessar banco nem provedor e valida o limite do lote',async()=>{
 process.env.SUPPORT_EMAILS_ENABLED='false';
 assert.deepEqual(await processSupportEmails(),{processed:0});
 await assert.rejects(processSupportEmails({limit:0}),/SUPPORT_EMAIL_LIMIT_INVALID/);
 await assert.rejects(processSupportEmails({limit:51}),/SUPPORT_EMAIL_LIMIT_INVALID/);
});
