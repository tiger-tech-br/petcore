import {useEffect, useId, useRef, useState} from 'react';
import {ArrowUpRight, CalendarDays, LoaderCircle, PawPrint, Search, UsersRound, X} from 'lucide-react';
import {api, endIso, startIso, today} from './api';

type Target = 'tutors' | 'pets' | 'calendar';
type Result = {id:string; target:Target; label:string; detail:string; query:string};
type Props = {can:(permission?:string)=>boolean; onNavigate:(target:Target, query:string)=>void};
const labels:Record<Target,string> = {tutors:'Clientes', pets:'Pets', calendar:'Atendimentos de hoje'};
const icons = {tutors:UsersRound, pets:PawPrint, calendar:CalendarDays};
const normalize = (value:unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export default function GlobalSearch({can, onNavigate}:Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(-1);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const tutorsAllowed = can('tutors'), petsAllowed = can('pets'), calendarAllowed = can('appointments');

  useEffect(() => {
    const dismiss = (event:PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  useEffect(() => {
    let active = true;
    setResults([]);
    setSelected(-1);
    setError('');
    if (query.trim().length < 2) {setLoading(false); return;}
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const sources:{target:Target; request:Promise<any[]>}[] = [];
      if (tutorsAllowed) sources.push({target:'tutors', request:api<any[]>('/data/tutors')});
      if (petsAllowed) sources.push({target:'pets', request:api<any[]>('/data/pets')});
      if (calendarAllowed) sources.push({target:'calendar', request:api<any[]>(`/calendar/appointments?from=${encodeURIComponent(startIso(today()))}&to=${encodeURIComponent(endIso(today()))}`)});
      const responses = await Promise.allSettled(sources.map(source => source.request));
      if (!active) return;
      const term = normalize(query.trim());
      const matches:Result[] = [];
      let failed = false;
      responses.forEach((response, index) => {
        if (response.status === 'rejected') {failed = true; return;}
        const target = sources[index].target;
        const rows = response.value.filter(row => {
          const fields = target === 'calendar' ? [row.pet_name, row.tutor_name, row.professional_name, ...(row.services || []).map((service:any) => service.name)] : [row.name, row.tutor_name, row.phone, row.email];
          return fields.some(value => normalize(value).includes(term));
        }).slice(0, 3);
        rows.forEach(row => {
          const label = target === 'calendar' ? row.pet_name : row.name;
          const detail = target === 'calendar'
            ? `${new Date(row.starts_at).toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit'})} · ${row.tutor_name}`
            : target === 'pets' ? row.tutor_name || row.species || 'Cadastro do pet' : row.phone || row.email || 'Cadastro do cliente';
          matches.push({id:row.id, target, label, detail, query:label});
        });
      });
      setResults(matches);
      setError(failed ? 'Não foi possível consultar todos os registros. Tente buscar novamente.' : '');
      setLoading(false);
    }, 300);
    return () => {active = false; window.clearTimeout(timer);};
  }, [query, tutorsAllowed, petsAllowed, calendarAllowed]);

  function navigate(result:Result) {
    onNavigate(result.target, result.query);
    setQuery('');
    setOpen(false);
    setSelected(-1);
    input.current?.blur();
  }

  return <div className="global-search" ref={container} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <Search size={20} aria-hidden="true"/>
    <input ref={input} type="search" value={query} autoComplete="off" placeholder="Buscar cliente, pet ou atendimento..." aria-label="Buscar cliente, pet ou atendimento" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && selected >= 0 ? `${listId}-${selected}` : undefined}
      onFocus={() => setOpen(true)} onChange={event => {setQuery(event.target.value); setOpen(true);}}
      onKeyDown={event => {
        if (event.key === 'Escape') {event.preventDefault(); setOpen(false); setQuery('');}
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          setSelected(previous => !results.length ? -1 : event.key === 'ArrowDown' ? (previous + 1) % results.length : (previous <= 0 ? results.length - 1 : previous - 1));
        }
        if (event.key === 'Enter' && open && results.length) {event.preventDefault(); navigate(results[selected < 0 ? 0 : selected]);}
      }}/>
    {query && <button type="button" className="global-search-clear" aria-label="Limpar busca" onClick={() => {setQuery(''); input.current?.focus();}}><X size={16}/></button>}
    {open && <div className="global-search-dropdown">
      {query.trim().length < 2 ? <p className="global-search-message">Digite pelo menos 2 caracteres para buscar.</p> : loading ? <p className="global-search-message" role="status"><LoaderCircle size={16} className="global-search-spinner"/> Buscando registros...</p> : <>
        {error && <p className="global-search-error" role="status">{error}</p>}
        {!results.length && !error && <p className="global-search-message" role="status">Nenhum registro encontrado para “{query.trim()}”.</p>}
      </>}
      <div id={listId} role="listbox" aria-label="Resultados da busca" aria-busy={loading}>
        {!loading && results.map((result, index) => {
          const Icon = icons[result.target];
          return <div key={`${result.target}-${result.id}`}>
            {(index === 0 || results[index - 1].target !== result.target) && <p className="global-search-group">{labels[result.target]}</p>}
            <button type="button" role="option" id={`${listId}-${index}`} aria-selected={selected === index} className={'global-search-result' + (selected === index ? ' selected' : '')} onMouseEnter={() => setSelected(index)} onMouseDown={event => event.preventDefault()} onClick={() => navigate(result)}>
              <span className="global-search-result-icon"><Icon size={18}/></span><span><strong>{result.label}</strong><small>{result.detail}</small></span><ArrowUpRight size={15}/>
            </button>
          </div>;
        })}
      </div>
    </div>}
  </div>;
}
