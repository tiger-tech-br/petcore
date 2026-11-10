import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeCheckout,reserveCheckoutNavigation} from '../src/checkout.ts';

test('checkout aceita somente HTTPS dos hosts PagBank autorizados',()=>{
  assert.equal(safeCheckout('https://pag.ae/82jFKCTjo'),'https://pag.ae/82jFKCTjo');
  for(const value of ['javascript:alert(1)','http://pag.ae/test','https://pag.ae.evil.test/pay','https://user@pag.ae/pay','https://pag.ae:8443/pay','https://other.test/pay',null])assert.equal(safeCheckout(value),null);
});
test('reserva no toque mas só navega após a autorização, sem manter opener',()=>{
  const calls:string[]=[],target={opener:{},closed:false,location:{href:'about:blank'},close(){calls.push('closed');}};
  const nav=reserveCheckoutNavigation(((url:string)=>{calls.push(url);return target;}) as unknown as typeof window.open);
  assert.deepEqual(calls,['about:blank']);assert.equal(target.opener,null);assert.equal(target.location.href,'about:blank');
  assert.equal(nav.go('https://pag.ae/82jFLbrjr'),true);assert.equal(target.location.href,'https://pag.ae/82jFLbrjr');
  nav.cancel();assert.deepEqual(calls,['about:blank']);
});
test('falha da API ou encaminhamento ao suporte fecha a janela reservada',()=>{
  let closed=0;const target={opener:null,closed:false,location:{href:'about:blank'},close(){closed++;}};
  const nav=reserveCheckoutNavigation((()=>target) as unknown as typeof window.open);
  nav.cancel();nav.cancel();assert.equal(closed,1);assert.equal(target.location.href,'about:blank');
});
test('popup bloqueado permite oferecer o link confirmado sem simular abertura',()=>{
  const nav=reserveCheckoutNavigation((()=>null) as typeof window.open);
  assert.equal(nav.go('https://pag.ae/82jFKCTjo'),false);
});
test('resposta de checkout com URL imprópria nunca é aberta',()=>{
  let closed=0;const target={opener:null,closed:false,location:{href:'about:blank'},close(){closed++;}};
  const nav=reserveCheckoutNavigation((()=>target) as unknown as typeof window.open);
  assert.throws(()=>nav.go('https://pag.ae.evil.test/pay'));assert.equal(closed,1);assert.equal(target.location.href,'about:blank');
});
