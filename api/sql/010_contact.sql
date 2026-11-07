-- Canais públicos fornecidos pelo responsável pelo PetCore. Não publica os
-- documentos nem substitui contatos personalizados já definidos na plataforma.
UPDATE commercial_settings SET
 support_email=CASE WHEN support_email IS NULL OR btrim(support_email)='' THEN 'tigertechbr@outlook.com' ELSE support_email END,
 privacy_email=CASE WHEN privacy_email IS NULL OR btrim(privacy_email)='' THEN 'tigertechbr@outlook.com' ELSE privacy_email END,
 updated_at=now()
WHERE singleton=true AND
 (support_email IS NULL OR btrim(support_email)='' OR privacy_email IS NULL OR btrim(privacy_email)='');
