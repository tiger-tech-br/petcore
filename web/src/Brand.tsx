export function BrandMark({className = ''}: {className?: string}) {
  return <svg className={`brand-mark ${className}`} viewBox="0 0 66 72" fill="none" aria-hidden="true">
    <ellipse cx="12" cy="24" rx="7.4" ry="10" transform="rotate(-25 12 24)" fill="#06cdd0"/>
    <ellipse cx="26" cy="12" rx="7.2" ry="11" transform="rotate(-7 26 12)" fill="#04cbd0"/>
    <ellipse cx="43" cy="12" rx="7.2" ry="11" transform="rotate(9 43 12)" fill="#10d1cb"/>
    <ellipse cx="56" cy="25" rx="7.3" ry="10" transform="rotate(28 56 25)" fill="#0bc9c7"/>
    <circle cx="33" cy="48" r="22" fill="#0b174c"/>
    <circle cx="33" cy="48" r="15.6" fill="white"/>
    <path d="M33 58S20 50 20 43.6C20 37.5 28.5 35.5 33 41.5C37.5 35.5 46 37.5 46 43.6C46 50 33 58 33 58Z" fill="#05bec1"/>
  </svg>;
}

export function Brand({inverse = false}: {inverse?: boolean}) {
  return <div className={`petcore-brand${inverse ? ' petcore-brand--inverse' : ''}`} aria-label="PetCore — Gestão para pet shops">
    <BrandMark/>
    <div className="brand-type"><span>Pet<span>Core</span></span><small>Gestão para pet shops</small></div>
  </div>;
}
