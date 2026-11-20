// New immutable API volume: update draft templates, preserve runtime/data code.
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
try{
 const packed=fs.readFileSync('/overlay/part1','utf8')+(process.env.API_OVERLAY_PART_A||'')+(process.env.API_OVERLAY_PART_B||'');
 const payload=JSON.parse(zlib.brotliDecompressSync(Buffer.from(packed,'base64'),{maxOutputLength:512*1024}).toString());
 const expected=['dist/legalTemplates.js','dist/operatorLegalDrafts.js'];
 if(!/^[a-f0-9]{40}$/.test(payload.revision||'')||!Array.isArray(payload.files)||payload.files.length!==2||new Set(payload.files.map(f=>f.path)).size!==2||payload.files.some(f=>!expected.includes(f.path)||typeof f.content!=='string'||hash(f.content)!==f.sha256))throw Error('LEGAL_RELEASE_PAYLOAD_INVALID');
 const previous=JSON.parse(fs.readFileSync('/previous/PETCORE-RELEASE.json','utf8'));
 if(previous.revision!=='b89691af9acc08de7b254e5ef844283d06d25ba7'||!previous.legacyScope||!previous.hyphenMetadata)throw Error('LEGAL_RELEASE_BASE_INVALID');
 const marker='/release/PETCORE-RELEASE.json';
 if(fs.existsSync(marker)){
  const record=JSON.parse(fs.readFileSync(marker,'utf8'));
  if(record.revision!==payload.revision||payload.files.some(f=>hash(fs.readFileSync('/release/'+f.path))!==f.sha256))throw Error('LEGAL_RELEASE_EXISTING_MISMATCH');
 }else{
  if(fs.readdirSync('/release').length)throw Error('LEGAL_RELEASE_TARGET_NOT_EMPTY');
  fs.cpSync('/previous','/release',{recursive:true,errorOnExist:true,force:false});
  for(const f of payload.files){const path='/release/'+f.path;fs.chmodSync(path,0o644);fs.writeFileSync(path,f.content,{mode:0o644});}
  fs.chmodSync(marker,0o644);fs.writeFileSync(marker,JSON.stringify({...previous,revision:payload.revision,previousRevision:previous.revision,unpublishedInfrastructureDraftsUpdated:true,files:[...(previous.files||[]),...payload.files.map(f=>({path:f.path,sha256:f.sha256}))]}));fs.chmodSync(marker,0o444);
 }
 console.log(JSON.stringify({ok:true,event:'petcore_legal_draft_release_prepared',revision:payload.revision,filesVerified:2,previousReleaseUnchanged:true,legalPublishedByThisTask:false}));
}catch(error){console.error(JSON.stringify({ok:false,code:/^LEGAL_RELEASE_[A-Z_]+$/.test(error.message||'')?error.message:'LEGAL_RELEASE_FAILED'}));process.exitCode=1;}
