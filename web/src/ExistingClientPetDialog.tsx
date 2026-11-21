import {useState,type FormEvent} from 'react';
import {api} from './api';
import FormDialog from './FormDialog';
import './styles/_client-registration.scss';

export default function ExistingClientPetDialog({tutor,onClose,onSaved,onError}:{tutor:{id:string;name:string};onClose:()=>void;onSaved:()=>void|Promise<void>;onError:(message:string)=>void}){
 const [name,setName]=useState(''),[species,setSpecies]=useState('Cachorro'),[size,setSize]=useState(''),[breed,setBreed]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{await api('/data/pets','POST',{name:name.trim(),tutor_id:tutor.id,species,size,breed:breed.trim()||null,notes:notes.trim()});await onSaved();}catch(cause){const message=(cause as Error).message;setError(message);onError(message);}finally{setBusy(false);}}
 return <FormDialog title="Adicionar pet ao cliente" description={`Responsável: ${tutor.name}. O pet ficará vinculado a esse cliente.`} onClose={onClose} busy={busy} error={error} wide><form className="client-registration" onSubmit={save}>
  <div className="client-registration-fields"><label>Nome do pet *<input required maxLength={160} placeholder="Ex.: Luna" value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label><label>Espécie<select value={species} disabled={busy} onChange={e=>setSpecies(e.target.value)}><option>Cachorro</option><option>Gato</option><option>Outro animal</option></select></label><label>Porte *<select required value={size} disabled={busy} onChange={e=>setSize(e.target.value)}><option value="">Selecione o porte</option><option value="pequeno">Pequeno</option><option value="medio">Médio</option><option value="grande">Grande</option></select></label><label>Raça (opcional)<input maxLength={160} value={breed} disabled={busy} onChange={e=>setBreed(e.target.value)}/></label><label className="client-registration-wide">Cuidados e observações (opcional)<textarea maxLength={3000} rows={3} value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)}/></label></div>
  <div className="form-actions"><button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Salvando...':'Salvar pet'}</button></div>
 </form></FormDialog>;
}
