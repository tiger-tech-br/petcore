import {useEffect,useRef,useState,type FormEvent} from 'react';
import {PawPrint,Plus,Trash2,UserRound} from 'lucide-react';
import FormDialog from './FormDialog';
import './styles/_client-registration.scss';

type PetDraft={key:string;name:string;species:string;breed:string;size:string;birth_date:string;notes:string};
type Result={tutor:any;pets:any[]};
type Props={open:boolean;onClose:()=>void;onSaved:(result:Result)=>void|Promise<void>;onError:(message:string)=>void;onClientOnly:()=>void};
const emptyPet=():PetDraft=>({key:crypto.randomUUID(),name:'',species:'Cachorro',breed:'',size:'',birth_date:'',notes:''});

export default function ClientRegistrationDialog({open,onClose,onSaved,onError,onClientOnly}:Props){
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[notes,setNotes]=useState(''),[consent,setConsent]=useState(false);
 const [pets,setPets]=useState<PetDraft[]>(()=>[emptyPet()]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const previousOpen=useRef(false),attempt=useRef<{key:string;body:unknown}|null>(null);
 useEffect(()=>{
  if(open&&!previousOpen.current&&!uncertain){setName('');setPhone('');setEmail('');setNotes('');setConsent(false);setPets([emptyPet()]);setError('');attempt.current=null;}
  previousOpen.current=open;
 },[open,uncertain]);
 const disabled=busy||uncertain;
 function changePet(key:string,field:keyof PetDraft,value:string){setPets(current=>current.map(pet=>pet.key===key?{...pet,[field]:value}:pet));}
 async function save(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  let definitive=false;
  try{
   if(!attempt.current){
    const body={tutor:{name:name.trim(),phone:phone.trim(),email:email.trim()||null,notes:notes.trim(),email_reminders_opt_in:consent},pets:pets.map(({key:_,...pet})=>({...pet,name:pet.name.trim(),breed:pet.breed.trim()||null,birth_date:pet.birth_date||null,notes:pet.notes.trim()}))};
    attempt.current={key:crypto.randomUUID(),body};
   }
   const body={...(attempt.current.body as object),idempotency_key:attempt.current.key};
   const response=await fetch('/api/data/clients-with-pets',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-PetCore-Request':'1'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
   const text=await response.text();let result:any;try{result=JSON.parse(text);}catch{throw Error('Não conseguimos confirmar o cadastro. Tente verificar novamente.');}
   if(!response.ok){definitive=response.status>=400&&response.status<500&&response.status!==408;throw Error(result.error||'Não foi possível salvar o cadastro.');}
   if(!result.tutor?.id||!Array.isArray(result.pets)||!result.pets.length)throw Error('Não conseguimos confirmar o cadastro. Tente verificar novamente.');
   attempt.current=null;setUncertain(false);await onSaved(result);
  }catch(cause){
   const message=definitive?(cause as Error).message:'Não conseguimos confirmar se o cadastro foi salvo. Use “Verificar cadastro” para conferir sem cadastrar duas vezes.';
   if(definitive){attempt.current=null;setUncertain(false);}else setUncertain(true);
   setError(message);onError(message);
  }finally{setBusy(false);}
 }
 if(!open)return null;
 return <FormDialog title="Novo cliente e pet" description="Cadastre o responsável e o pet no mesmo lugar." onClose={onClose} busy={busy} error={error} wide>
  <form className="client-registration" onSubmit={save}>
   <section className="client-registration-section" aria-labelledby="client-owner-heading">
    <div className="client-registration-heading"><span><UserRound size={22}/></span><div><h3 id="client-owner-heading">Quem é o responsável?</h3><p>Informe como podemos identificar e contatar o cliente.</p></div></div>
    <div className="client-registration-fields">
     <label>Nome do responsável *<input required minLength={2} maxLength={160} autoComplete="name" placeholder="Ex.: Ana Souza" value={name} disabled={disabled} onChange={e=>setName(e.target.value)}/></label>
     <label>Telefone / WhatsApp<input type="tel" inputMode="tel" autoComplete="tel" maxLength={40} placeholder="(11) 99999-9999" value={phone} disabled={disabled} onChange={e=>setPhone(e.target.value)}/></label>
    </div>
    <details className="client-registration-extra"><summary>E-mail e observações (opcionais)</summary><div className="client-registration-fields">
     <label>E-mail<input type="email" autoComplete="email" placeholder="cliente@exemplo.com" value={email} disabled={disabled} onChange={e=>{setEmail(e.target.value);setConsent(false);}}/></label>
     <label>Observações sobre o cliente<textarea maxLength={3000} rows={3} placeholder="Alguma informação importante para o atendimento?" value={notes} disabled={disabled} onChange={e=>setNotes(e.target.value)}/></label>
     <label className="client-registration-consent"><input type="checkbox" checked={consent} disabled={disabled||!email.trim()} onChange={e=>setConsent(e.target.checked)}/><span>O cliente autorizou receber lembretes de agendamento por e-mail.</span></label>
    </div></details>
   </section>
   <section className="client-registration-section" aria-labelledby="client-pets-heading">
    <div className="client-registration-heading"><span><PawPrint size={22}/></span><div><h3 id="client-pets-heading">Qual pet vamos atender?</h3><p>O pet já ficará vinculado ao responsável acima.</p></div></div>
    <div className="client-registration-pets">{pets.map((pet,index)=><fieldset className="client-registration-pet" key={pet.key}>
     <legend>{pets.length>1?`Pet ${index+1}`:'Dados do pet'}</legend>
     {pets.length>1&&<button type="button" className="client-remove-pet" aria-label={`Remover pet ${index+1}`} disabled={disabled} onClick={()=>setPets(current=>current.filter(item=>item.key!==pet.key))}><Trash2 size={17}/>Remover</button>}
     <div className="client-registration-fields">
      <label>Nome do pet *<input required maxLength={160} placeholder="Ex.: Luna" value={pet.name} disabled={disabled} onChange={e=>changePet(pet.key,'name',e.target.value)}/></label>
      <label>Espécie *<select required value={pet.species} disabled={disabled} onChange={e=>changePet(pet.key,'species',e.target.value)}><option>Cachorro</option><option>Gato</option><option>Outro animal</option></select></label>
      <label>Porte *<select required value={pet.size} disabled={disabled} onChange={e=>changePet(pet.key,'size',e.target.value)}><option value="">Selecione o porte</option><option value="pequeno">Pequeno</option><option value="medio">Médio</option><option value="grande">Grande</option></select></label>
     </div>
     <details className="client-registration-extra"><summary>Raça, nascimento e cuidados (opcionais)</summary><div className="client-registration-fields">
      <label>Raça<input maxLength={160} placeholder="Ex.: Shih-tzu ou sem raça definida" value={pet.breed} disabled={disabled} onChange={e=>changePet(pet.key,'breed',e.target.value)}/></label>
      <label>Data de nascimento<input type="date" value={pet.birth_date} disabled={disabled} onChange={e=>changePet(pet.key,'birth_date',e.target.value)}/></label>
      <label className="client-registration-wide">Cuidados e observações<textarea maxLength={3000} rows={3} placeholder="Ex.: tem alergia a algum produto ou precisa de um cuidado especial." value={pet.notes} disabled={disabled} onChange={e=>changePet(pet.key,'notes',e.target.value)}/></label>
     </div></details>
    </fieldset>)}</div>
    {pets.length<10&&<button type="button" className="ghost-btn client-add-pet" disabled={disabled} onClick={()=>setPets(current=>[...current,emptyPet()])}><Plus size={17}/>Adicionar outro pet deste cliente</button>}
   </section>
   <div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Salvando...':uncertain?'Verificar cadastro':'Salvar cliente e pet'}</button></div>
   <button type="button" className="text-link client-without-pet" disabled={disabled} onClick={onClientOnly}>Cadastrar somente o cliente, sem pet</button>
  </form>
 </FormDialog>;
}
