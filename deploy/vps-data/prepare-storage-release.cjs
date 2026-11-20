// New immutable API volume; the running/previous release is never modified.
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
try{
 const packed=(process.env.API_OVERLAY_PART_A||'')+(process.env.API_OVERLAY_PART_B||'');
 const payload=JSON.parse(zlib.brotliDecompressSync(Buffer.from(packed,'base64'),{maxOutputLength:512*1024}).toString());
 const expected=['dist/photoBackup.js','dist/storageMetadata.js','scripts/backup.mjs','scripts/photo-recovery-smoke.mjs'];
 if(!/^[a-f0-9]{40}$/.test(payload.revision||'')||!Array.isArray(payload.files)||payload.files.length!==expected.length||payload.files.some(f=>!expected.includes(f.path)||typeof f.content!=='string'||hash(f.content)!==f.sha256)||new Set(payload.files.map(f=>f.path)).size!==expected.length)throw Error('STORAGE_RELEASE_PAYLOAD_INVALID');
 const previous=JSON.parse(fs.readFileSync('/previous/PETCORE-RELEASE.json','utf8'));
 if(previous.revision!=='33c1d01572b3d30bd1e225eb6abc6c37d28ecd6e'||!previous.legacyScope)throw Error('STORAGE_RELEASE_BASE_INVALID');
 const marker='/release/PETCORE-RELEASE.json';
 if(fs.existsSync(marker)){
  const record=JSON.parse(fs.readFileSync(marker,'utf8'));
  if(record.revision!==payload.revision||payload.files.some(f=>hash(fs.readFileSync('/release/'+f.path))!==f.sha256))throw Error('STORAGE_RELEASE_EXISTING_MISMATCH');
 }else{
  if(fs.readdirSync('/release').length)throw Error('STORAGE_RELEASE_TARGET_NOT_EMPTY');
  fs.cpSync('/previous','/release',{recursive:true,errorOnExist:true,force:false});
  for(const file of payload.files){const target='/release/'+file.path;if(fs.existsSync(target))fs.chmodSync(target,0o644);fs.writeFileSync(target,file.content,{mode:0o644});}
  fs.chmodSync(marker,0o644);fs.writeFileSync(marker,JSON.stringify({revision:payload.revision,baseImage:previous.baseImage,previousRevision:previous.revision,legacyScope:true,hyphenMetadata:true,files:payload.files.map(f=>({path:f.path,sha256:f.sha256}))}));fs.chmodSync(marker,0o444);
 }
 console.log(JSON.stringify({ok:true,event:'petcore_storage_release_prepared',revision:payload.revision,legacyScope:true,hyphenMetadata:true,filesVerified:4,previousReleaseUnchanged:true}));
}catch(error){console.error(JSON.stringify({ok:false,code:/^STORAGE_RELEASE_[A-Z_]+$/.test(error.message||'')?error.message:'STORAGE_RELEASE_FAILED'}));process.exitCode=1;}
