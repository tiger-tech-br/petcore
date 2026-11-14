export const COMPANY_EXPORT_MAX_BYTES=128*1024*1024;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type ExportRequest={password:string;ticket_id:string;identity_verified:true};

export async function prepareCompanyExportDownload(companyId:string,input:ExportRequest,signal:AbortSignal){
 signal.throwIfAborted();
 if(!uuid.test(companyId)||!uuid.test(input.ticket_id)||!input.identity_verified)throw Error('Selecione a empresa e o atendimento verificado antes de exportar.');
 const response=await fetch(`/api/commercial/platform/subscriptions/${companyId}/export`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-PetCore-Request':'1'},body:JSON.stringify(input),signal});
 if(!response.ok){let message='Não foi possível preparar a exportação.';try{const result=await response.json();if(typeof result.error==='string')message=result.error;}catch{}throw Error(message);}
 if(!/^application\/(gzip|x-gzip)(;|$)/i.test(response.headers.get('content-type')??'')||!/^attachment\b/i.test(response.headers.get('content-disposition')??''))throw Error('O servidor não devolveu um arquivo de exportação válido.');
 if(Number(response.headers.get('content-length')??0)>COMPANY_EXPORT_MAX_BYTES)throw Error('O arquivo é grande para download no painel. Solicite a preparação em lotes.');
 const reader=response.body?.getReader();if(!reader)throw Error('Não foi possível receber o arquivo de exportação.');
 const parts:BlobPart[]=[];let bytes=0;
 try{
  for(;;){const chunk=await reader.read();signal.throwIfAborted();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>COMPANY_EXPORT_MAX_BYTES)throw Error('O arquivo é grande para download no painel. Solicite a preparação em lotes.');const copy=new Uint8Array(chunk.value.byteLength);copy.set(chunk.value);parts.push(copy.buffer);}
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 if(!bytes)throw Error('O arquivo de exportação está vazio. Tente preparar novamente.');
 return {blob:new Blob(parts,{type:'application/gzip'}),filename:`PetCore-empresa-${companyId.toLowerCase()}.tar.gz`};
}

export function saveCompanyExportDownload(blob:Blob,filename:string){
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.rel='noopener';document.body.appendChild(link);
 try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
}
