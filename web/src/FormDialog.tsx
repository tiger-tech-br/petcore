import {useId, useLayoutEffect, useRef, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

type Props = {
  title:string;
  description?:string;
  onClose:()=>void;
  children:ReactNode;
  wide?:boolean;
  busy?:boolean;
  error?:string;
  notice?:string;
};

let scrollLocks = 0;
let restorePageScroll:(()=>void)|undefined;

function lockPageScroll() {
  if (scrollLocks++ === 0) {
    const body = document.body;
    const x = window.scrollX, y = window.scrollY;
    const properties = ['position', 'top', 'left', 'width', 'overflow', 'padding-right'] as const;
    const previous = properties.map(name=>({name, value:body.style.getPropertyValue(name), priority:body.style.getPropertyPriority(name)}));
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const paddingRight = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.position = 'fixed';
    body.style.top = `${-y}px`;
    body.style.left = `${-x}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${paddingRight + scrollbarWidth}px`;
    restorePageScroll = ()=>{
      for (const {name, value, priority} of previous) {
        if (value) body.style.setProperty(name, value, priority);
        else body.style.removeProperty(name);
      }
      window.scrollTo(x, y);
    };
  }
  return ()=>{
    if (--scrollLocks === 0) {
      restorePageScroll?.();
      restorePageScroll = undefined;
    }
  };
}

function restoreFocus(previous:HTMLElement|null) {
  const target = previous?.isConnected && previous !== document.body && !previous.matches(':disabled')
    ? previous
    : document.querySelector<HTMLElement>('.page-header button:not(:disabled)')
      || Array.from(document.querySelectorAll<HTMLElement>('.content-wrap button:not(:disabled)')).find(button=>!button.closest('.alert'))
      || document.querySelector<HTMLElement>('.mobile-bottom-nav button');
  const openDialogs = document.querySelectorAll('dialog[open]');
  const activeDialog = openDialogs.item(openDialogs.length - 1);
  if (activeDialog && target && !activeDialog.contains(target)) return;
  target?.focus({preventScroll:true});
}

export default function FormDialog({title, description, onClose, children, wide=false, busy=false, error, notice}:Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const titleId = useId(), descriptionId = useId();

  useLayoutEffect(()=>{
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    if (!element.open) element.showModal();
    heading.current?.focus({preventScroll:true});
    return ()=>{
      // Closing during StrictMode cleanup must not invoke the parent's onClose.
      if (element.open) element.close();
      unlock();
      // Wait for the parent commit: a saved row might have left the list.
      queueMicrotask(()=>restoreFocus(previousFocus));
    };
  }, []);

  useLayoutEffect(()=>{
    if (content.current) content.current.scrollTop = 0;
    if (dialog.current?.open) heading.current?.focus({preventScroll:true});
  }, [title]);

  return createPortal(<dialog
    ref={dialog}
    className={`form-dialog${wide?' form-dialog--wide':''}`}
    aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    aria-modal="true"
    aria-busy={busy || undefined}
    onCancel={event=>{event.preventDefault(); if (!busy) onClose();}}
    onKeyDown={event=>{
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
        .filter(element=>element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
      if (!controls.length) {
        event.preventDefault(); heading.current?.focus({preventScroll:true}); return;
      }
      const active = document.activeElement;
      const first = controls[0], last = controls[controls.length - 1];
      if (!controls.some(element=>element === active)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first.focus();
      }
    }}
  >
    <header className="form-dialog__header">
      <div>
        <h2 ref={heading} id={titleId} tabIndex={-1}>{title}</h2>
        {description && <p id={descriptionId}>{description}</p>}
      </div>
      <button type="button" className="form-dialog__close" aria-label={`Fechar ${title}`} onClick={()=>{if (!busy) onClose();}} disabled={busy}><X size={23}/></button>
    </header>
    {error && <div className="form-dialog__message form-dialog__message--error" role="alert">{error}</div>}
    {notice && <div className="form-dialog__message form-dialog__message--notice" role="status">{notice}</div>}
    <div className="form-dialog__content" ref={content}>{children}</div>
  </dialog>, document.body);
}
