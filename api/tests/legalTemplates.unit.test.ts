import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legalTemplatesFor} from '../src/legalTemplates.js';

test('rascunhos refletem as decisões comerciais sem fingir publicação ou transferências aprovadas',()=>{
 const draft=legalTemplatesFor();
 assert.match(draft.terms,/em até um dia útil/);
 assert.match(draft.terms,/reembolso voluntário proporcional/);
 assert.match(draft.terms,/30 dias corridos para exportação assistida/);
 assert.match(draft.privacy,/backups é de 30 dias/);
 assert.match(draft.privacy,/não coleta GPS/);
 assert.match(draft.privacy,/MECANISMO_TRANSFERENCIAS_VALIDADO/);
 for(const text of Object.values(draft)){
  assert.match(text,/APROVACAO_JURIDICA_E_OPERACIONAL/);
  assert.match(text,/RASCUNHO PARA REVISÃO/);
  assert.match(text,/José Andrey Pereira Lisboa/);
  assert.doesNotMatch(text,/^\||^##|\*\*/m);
 }
});
test('preço, Free e tolerância continuam parametrizados sem mudar os 30 dias de retenção',()=>{
 const draft=legalTemplatesFor({trial_days:10,grace_days:0,plans:[{id:'monthly',amount_cents:1290,interval_months:1},{id:'yearly',amount_cents:9900,interval_months:12}]});
 assert.match(draft.terms,/Teste de 10 dias corridos/);assert.match(draft.privacy,/Free oferece 10 dias/);
 assert.match(draft.terms,/R\$ 12,90/);assert.match(draft.terms,/R\$ 99,00/);
 assert.match(draft.terms,/Não há tolerância operacional/);assert.match(draft.privacy,/backups é de 30 dias/);
});
test('outro operador conserva o modelo genérico e não recebe identidade ou políticas aprovadas em nome da Tiger Tech',()=>{
 const draft=legalTemplatesFor({brand:'Outra marca',legal_name:'Outro prestador',support_email:'suporte@example.test',privacy_email:'privacidade@example.test'});
 assert.match(draft.terms,/Outro prestador/);assert.match(draft.terms,/Outra marca/);
 assert.doesNotMatch(draft.terms,/José Andrey Pereira Lisboa|Rua Brasílio Machado|reembolso voluntário proporcional/);
 assert.match(draft.terms,/NATUREZA_DO_PRESTADOR/);
});
test('canais de suporte e privacidade podem ser distintos sem apagar o canal do titular',()=>{
 const draft=legalTemplatesFor({support_email:'suporte@example.test',privacy_email:'direitos@example.test'});
 assert.match(draft.privacy,/Suporte: suporte@example.test\. Privacidade: direitos@example.test/);
 assert.match(draft.privacy,/dados administrados pela Tiger Tech, use direitos@example.test/);
});

test('rascunhos do operador e modelo genérico refletem a infraestrutura atual sem aprovar transferências',()=>{
 for(const draft of [legalTemplatesFor(),legalTemplatesFor({brand:'Outra marca',legal_name:'Outro prestador'})]){
  assert.match(draft.privacy,/Hostinger: [Aa]plicação/);
  assert.match(draft.privacy,/PostgreSQL 18\.7 com TLS/);
  assert.match(draft.privacy,/Versity Gateway/);
  assert.match(draft.privacy,/Campinas, Brasil/);
  assert.match(draft.privacy,/[Cc]ópias cifradas.*fora da VPS/);
  assert.match(draft.privacy,/atualização manual|atualização dessa cópia é manual/);
  assert.match(draft.privacy,/Resend:.*Estados Unidos/);
  assert.match(draft.privacy,/não (?:comprova|significa) (?:localização exclusiva|residência integral)/);
  assert.doesNotMatch(draft.privacy,/^- (?:Neon|Railway):/m);
  assert.match(draft.privacy,/MECANISMO_TRANSFERENCIAS_VALIDADO|REVISAO_FORNECEDORES_E_TRANSFERENCIAS/);
  assert.match(draft.privacy,/APROVACAO_JURIDICA_E_OPERACIONAL/);
  assert.match(draft.privacy,/RASCUNHO PARA REVISÃO/);
 }
});
