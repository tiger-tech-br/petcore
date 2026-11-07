-- Links enviados pelo responsável e conferidos no checkout do PagBank em
-- 06/11/2026: nome PetCore, recorrência mensal/anual e valores R$ 35/R$ 350.
-- Preserva links personalizados. A publicação jurídica continua independente.
WITH updated AS (
 UPDATE subscription_plans SET
  name=CASE id WHEN 'monthly' THEN 'PetCore Mensal' ELSE 'PetCore Anual' END,
  checkout_url=CASE id WHEN 'monthly' THEN 'https://pag.ae/82jFKCTjo' ELSE 'https://pag.ae/82jFLbrjr' END,
  checkout_reviewed=true
 WHERE (id='monthly' AND amount_cents=3500 AND checkout_url='https://pag.ae/82ixDFWsJ')
    OR (id='yearly' AND amount_cents=35000 AND checkout_url='https://pag.ae/82ixDhLCJ')
 RETURNING id,amount_cents
)
INSERT INTO audit_events(action,entity_type,metadata)
 SELECT 'platform.plan_links_reviewed_migration','subscription_plan',
  jsonb_build_object('planId',id,'amountCents',amount_cents,'source','PagBank checkout conferido em 06/11/2026')
 FROM updated;
