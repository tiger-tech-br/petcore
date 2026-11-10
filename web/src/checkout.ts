export function safeCheckout(value:string|null|undefined){
  if(!value)return null;
  try{
    const url=new URL(value),hosts=['pag.ae','pagbank.com.br','pagseguro.uol.com.br'];
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&hosts.some(host=>url.hostname===host||host!=='pag.ae'&&url.hostname.endsWith('.'+host))?url.href:null;
  }catch{return null;}
}

// Reserve the window during the tap. Android also requires this user gesture.
// Navigate only after the API has authorized the checkout, never before it.
export function reserveCheckoutNavigation(open:typeof window.open=window.open.bind(window)){
  let target:Window|null=null;
  try{target=open('about:blank','_blank');if(target)target.opener=null;}catch{}
  function cancel(){try{target?.close();}catch{}target=null;}
  return {
    cancel,
    go(value:string|null|undefined){
      const url=safeCheckout(value);
      if(!url){cancel();throw Error('O link de pagamento deste plano não está disponível.');}
      try{if(target&&!target.closed){target.location.href=url;target=null;return true;}}catch{}
      cancel();return false;
    }
  };
}
