import {afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {COMPANY_EXPORT_MAX_BYTES,prepareCompanyExportDownload} from '../src/tenantExportDownload.ts';

const originalFetch=globalThis.fetch,company='10000000-0000-4000-8000-000000000001',ticket='10000000-0000-4000-8000-000000000002';
const input={password:'private-test-password',ticket_id:ticket,identity_verified:true as const};
afterEach(()=>{globalThis.fetch=originalFetch;});

test('download usa sessão, POST protegido e somente a empresa selecionada',async()=>{
 const controller=new AbortController();let captured:any;
 globalThis.fetch=(async(path,options)=>{captured={path,options};return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'application/gzip','Content-Disposition':'attachment; filename="server-name.tar.gz"'}});}) as typeof fetch;
 const result=await prepareCompanyExportDownload(company,input,controller.signal);
 assert.equal(captured.path,`/api/commercial/platform/subscriptions/${company}/export`);assert.equal(captured.options.method,'POST');assert.equal(captured.options.credentials,'include');assert.equal(captured.options.headers['X-PetCore-Request'],'1');assert.equal(captured.options.signal,controller.signal);assert.deepEqual(JSON.parse(captured.options.body),input);
 assert.equal(result.blob.size,3);assert.equal(result.filename,`PetCore-empresa-${company}.tar.gz`);
});
test('falha HTTP não vira arquivo e preserva a orientação do servidor',async()=>{
 globalThis.fetch=(async()=>new Response(JSON.stringify({error:'Confirme sua senha.'}),{status:403,headers:{'Content-Type':'application/json'}})) as typeof fetch;
 await assert.rejects(prepareCompanyExportDownload(company,input,new AbortController().signal),/Confirme sua senha/);
});
test('resposta HTML ou arquivo acima do limite não inicia download',async()=>{
 globalThis.fetch=(async()=>new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}})) as typeof fetch;
 await assert.rejects(prepareCompanyExportDownload(company,input,new AbortController().signal),/arquivo de exportação válido/);
 globalThis.fetch=(async()=>new Response(new Uint8Array([1]),{headers:{'Content-Type':'application/gzip','Content-Disposition':'attachment','Content-Length':String(COMPANY_EXPORT_MAX_BYTES+1)}})) as typeof fetch;
 await assert.rejects(prepareCompanyExportDownload(company,input,new AbortController().signal),/grande para download/);
});
test('identificadores inválidos são recusados antes de qualquer requisição',async()=>{
 let requests=0;globalThis.fetch=(async()=>{requests++;throw Error('unexpected');}) as typeof fetch;
 await assert.rejects(prepareCompanyExportDownload('../other',input,new AbortController().signal));assert.equal(requests,0);
});
