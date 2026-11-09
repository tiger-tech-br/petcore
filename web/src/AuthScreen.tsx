import React, {useEffect,useState} from 'react';
import {ArrowLeft, ArrowRight, Eye, EyeOff, Headphones, LockKeyhole, Mail, UserRound, X} from 'lucide-react';
import {api} from './api';
import {Brand, BrandMark} from './Brand';
import {listenNativeBack} from './nativeAndroid';

type AuthMode = 'login' | 'invite' | 'forgot' | 'reset';

export default function AuthScreen({onDone,onReadLegal}: {onDone: () => void;onReadLegal:(kind:'privacy'|'terms')=>void}) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false), [helpOpen, setHelpOpen] = useState(false);
  const [legal,setLegal]=useState<{published:boolean;version:string;operator:{supportEmail:string|null}}|null>(null),[legalLoading,setLegalLoading]=useState(true),[legalError,setLegalError]=useState(''),[legalRevision,setLegalRevision]=useState(0),[acceptedTerms,setAcceptedTerms]=useState(false);
  useEffect(()=>{let active=true;setLegalLoading(true);setLegalError('');api<{published:boolean;version:string;operator:{supportEmail:string|null}}>('/public/legal').then(data=>{if(active)setLegal(data);}).catch(cause=>{if(active)setLegalError(cause instanceof Error?cause.message:'Não foi possível consultar os termos.');}).finally(()=>{if(active)setLegalLoading(false);});return()=>{active=false;};},[legalRevision]);
  const [mode, setMode] = useState<AuthMode>(() => {
    const query = new URLSearchParams(location.search);
    return query.has('invite') ? 'invite' : query.has('reset') ? 'reset' : 'login';
  });
  const query = new URLSearchParams(location.search), invite = query.get('invite'), reset = query.get('reset');

  function changeMode(next: AuthMode) {setMode(next); setError(''); setNotice(''); setShowPassword(false);}
  useEffect(()=>listenNativeBack(()=>{
    if(loading)return true;
    if(helpOpen){setHelpOpen(false);return true;}
    if(mode==='forgot'||mode==='invite'){changeMode('login');return true;}
    return false;
  },true),[mode,loading,helpOpen]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(''); setNotice('');
    try {
      if (mode === 'login') {await api('/auth/login', 'POST', {email, password}); await onDone();}
      else if (mode === 'invite') {
        if(!legal)throw Error('Aguarde o carregamento dos documentos antes de ativar a conta.');
        if(legal.published&&!acceptedTerms)throw Error('Leia e aceite os Termos de Uso atuais antes de ativar a conta.');
        await api('/auth/invite/accept', 'POST', {inviteToken: invite, name, password,accepted_terms:acceptedTerms,terms_version:legal.version});
        history.replaceState(null, '', '/'); setMode('login'); setPassword(''); setNotice('Conta criada. Agora faça seu login.');
      } else if (mode === 'forgot') {
        const data = await api<{message: string}>('/auth/password/forgot', 'POST', {email}); setNotice(data.message);
      } else {
        await api('/auth/password/reset', 'POST', {token: reset, password});
        history.replaceState(null, '', '/'); setMode('login'); setPassword(''); setNotice('Senha alterada. Faça login.');
      }
    } catch (ex) {setError((ex as Error).message);} finally {setLoading(false);}
  }

  const headings: Record<AuthMode, string> = {login: 'Acesse seu painel', invite: 'Ative sua conta', forgot: 'Recupere seu acesso', reset: 'Crie uma nova senha'};
  const descriptions: Record<AuthMode, string> = {login: 'Entre com sua conta PetCore.', invite: 'Preencha seus dados para começar.', forgot: 'Informe o e-mail da sua conta.', reset: 'Use uma senha com pelo menos 12 caracteres.'};

  return <main className="auth-page"><div className="auth-card">
    <header className="auth-top"><div className="auth-logo"><Brand/></div><button className="auth-support-link" type="button" aria-label="Suporte" onClick={() => setHelpOpen(!helpOpen)} aria-expanded={helpOpen} aria-controls="auth-help"><Headphones size={24}/><span>Suporte</span></button></header>
    <div className="auth-content">
      <section className="auth-hero" aria-label="Mais tempo para cuidar. Gestão para pet shops.">
        <div className="auth-hero-copy"><h1>Mais tempo<br/>para cuidar.</h1><span className="auth-hero-line"/><p>Gestão para pet shops</p></div>
        <div className="auth-blob auth-blob-back"/><div className="auth-blob auth-blob-front"/><div className="auth-hero-dot"/>
        <div className="auth-hero-paw" aria-hidden="true"><BrandMark/></div><div className="auth-wave auth-wave-one"/><div className="auth-wave auth-wave-two"/>
        <img className="auth-dog" src="/images/petcore-dog.png" alt="Cachorrinho PetCore com gravata amarela e verde do Brasil" fetchPriority="high"/>
      </section>
      <section className="auth-login" aria-labelledby="auth-heading"><div className="auth-form-content">
        <div className="auth-form-heading"><h2 id="auth-heading">{headings[mode]}</h2><p>{descriptions[mode]}</p></div>
        {error && <div className="auth-alert auth-alert-error" role="alert">{error}</div>}{notice && <div className="auth-alert auth-alert-success" role="status">{notice}</div>}
        <form onSubmit={submit} className="auth-form">
          {mode === 'invite' && <label className="auth-field" htmlFor="auth-name">Seu nome<span className="auth-input"><UserRound size={21}/><input id="auth-name" required minLength={2} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Nome completo" disabled={loading}/></span></label>}
          {['login', 'forgot'].includes(mode) && <label className="auth-field" htmlFor="auth-email">E-mail<span className="auth-input"><Mail size={21}/><input id="auth-email" required type="email" maxLength={255} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="seuemail@exemplo.com" disabled={loading}/></span></label>}
          {mode !== 'forgot' && <label className="auth-field" htmlFor="auth-password">Senha<span className="auth-input"><LockKeyhole size={22}/><input id="auth-password" required type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 8 : 12} maxLength={200} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'login' ? 'Digite sua senha' : 'Crie uma senha segura'} disabled={loading}/><button className="auth-password-toggle" type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <Eye size={22}/> : <EyeOff size={22}/>}</button></span></label>}
          {mode === 'login' && <div className="auth-form-options"><button type="button" className="auth-text-button" onClick={() => changeMode('forgot')} disabled={loading}>Esqueci minha senha</button></div>}
          {mode==='invite'&&legal?.published&&<div className="auth-invite-terms"><label><input type="checkbox" required disabled={loading} checked={acceptedTerms} onChange={event=>setAcceptedTerms(event.target.checked)}/><span>Li e aceito os Termos de Uso e estou ciente da Política de Privacidade.</span></label><div><button type="button" onClick={()=>onReadLegal('terms')}>Ler Termos de Uso</button><button type="button" onClick={()=>onReadLegal('privacy')}>Ler Política de Privacidade</button></div></div>}
          {mode==='invite'&&legalError&&<div className="auth-alert auth-alert-error" role="alert">{legalError}<button type="button" className="auth-text-button" onClick={()=>setLegalRevision(value=>value+1)}>Tentar novamente</button></div>}
          <button className="auth-submit" type="submit" disabled={loading||mode==='invite'&&(legalLoading||!!legalError)}><span>{loading ? 'Processando...' : mode === 'login' ? 'Entrar' : mode === 'invite' ? 'Ativar conta' : mode === 'forgot' ? 'Enviar recuperação' : 'Salvar nova senha'}</span><ArrowRight size={28}/></button>
          {mode === 'forgot' && <button type="button" className="auth-back auth-text-button" onClick={() => changeMode('login')} disabled={loading}><ArrowLeft size={17}/>Voltar ao login</button>}
          {mode === 'invite' && <button type="button" className="auth-back auth-text-button" onClick={() => changeMode('login')} disabled={loading}>Já tenho uma conta — entrar e aceitar convite</button>}
        </form>
        <div className="auth-help-footer"><p>Precisa de ajuda?</p><button className="auth-text-button" type="button" onClick={() => setHelpOpen(!helpOpen)} aria-expanded={helpOpen} aria-controls="auth-help">Fale com o suporte</button></div>
        {helpOpen && <div className="auth-help-panel" id="auth-help" role="region" aria-label="Ajuda com acesso"><button type="button" className="auth-help-close" aria-label="Fechar ajuda" onClick={() => setHelpOpen(false)}><X size={18}/></button><strong>Vamos ajudar você a entrar</strong><p>Confira se o e-mail é o mesmo usado no seu cadastro. Se esqueceu sua senha, use a opção de recuperação. Para outras dúvidas, fale com o administrador da sua empresa.</p>{legal?.operator.supportEmail&&<p>Suporte: <a href={`mailto:${legal.operator.supportEmail}`}>{legal.operator.supportEmail}</a></p>}</div>}
      </div><footer className="auth-copyright"><span>© {new Date().getFullYear()} PetCore</span><nav className="auth-legal-links" aria-label="Documentos do PetCore"><button type="button" onClick={()=>onReadLegal('privacy')}>Privacidade</button><button type="button" onClick={()=>onReadLegal('terms')}>Termos de Uso</button></nav></footer></section>
    </div>
  </div></main>;
}
