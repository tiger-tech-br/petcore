import {useEffect,useState} from 'react';
import {ArrowLeft,FileText,ShieldCheck} from 'lucide-react';
import {Brand} from './Brand';
import {api} from './api';

type Legal={published:boolean;version:string;effectiveDate:string|null;operator:{brand:string;legalName:string|null;supportEmail:string|null;privacyEmail:string|null;address:string|null};documents:{privacy:string;terms:string};subprocessors:{name:string;purpose:string;location:string}[]};
export default function LegalScreen({kind,onBack}:{kind:'privacy'|'terms';onBack:()=>void}){
 const [document,setDocument]=useState<Legal|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setError('');api<Legal>('/public/legal').then(data=>{if(active)setDocument(data);}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Não foi possível carregar o documento.');});return()=>{active=false;};},[revision]);
 const title=kind==='privacy'?'Política de Privacidade':'Termos de Uso';
 return <div className="legal-screen"><header className="legal-header"><Brand/><button className="ghost-btn" onClick={onBack}><ArrowLeft size={17}/>Voltar</button></header><main className="legal-document">
  <div className="legal-eyebrow">{kind==='privacy'?<ShieldCheck size={24}/>:<FileText size={24}/>}PETCORE</div><h1>{title}</h1>
  {error?<div className="legal-error" role="alert"><p>{error}</p><button className="ghost-btn" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></div>:!document?<p role="status">Carregando documento…</p>:<>
   {!document.published&&<div className="legal-draft" role="status"><strong>Documento em preparação</strong><p>Esta versão ainda precisa de aprovação e preenchimento pelo responsável pelo serviço. Não representa um aceite contratual.</p></div>}
   <p className="legal-version">Versão {document.version||'em preparação'}{document.effectiveDate?` · Vigência: ${new Date(document.effectiveDate+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC'})}`:''}</p>
   <div className="legal-body">{document.documents[kind]||'O responsável pelo serviço ainda não disponibilizou o texto deste documento.'}</div>
   <section className="legal-operator"><h2>Responsável e contato</h2><dl><div><dt>Marca</dt><dd>{document.operator.brand||'PetCore'}</dd></div><div><dt>Responsável legal</dt><dd>{document.operator.legalName||'A preencher pelo responsável'}</dd></div><div><dt>Suporte</dt><dd>{document.operator.supportEmail||'Canal a ser informado'}</dd></div><div><dt>Privacidade</dt><dd>{document.operator.privacyEmail||'Canal a ser informado'}</dd></div>{document.operator.address&&<div><dt>Endereço</dt><dd>{document.operator.address}</dd></div>}</dl></section>
   {kind==='privacy'&&<section className="legal-processors"><h2>Fornecedores informados</h2>{document.subprocessors.length?<ul>{document.subprocessors.map((processor,index)=><li key={processor.name+index}><strong>{processor.name}</strong><p>{processor.purpose}</p><small>Localização: {processor.location}</small></li>)}</ul>:<p>A relação de fornecedores e regiões deve ser preenchida pelo responsável antes da publicação comercial.</p>}</section>}
  </>}
 </main><footer className="legal-footer">{document?.operator.brand||'PetCore'} · Gestão para pet shops</footer></div>;
}
