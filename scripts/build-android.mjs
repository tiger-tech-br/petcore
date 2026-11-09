// Builds and signs locally. Signing material never enters Gradle or the APK.
import {existsSync,mkdirSync,readFileSync,writeFileSync,statSync,lstatSync,readdirSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const options=process.argv.slice(2);
if(options.includes('--help')){console.log('node scripts/build-android.mjs [--offline] [--skip-build]');process.exit(0);}
const fail=code=>{throw Object.assign(new Error(),{code});};
function run(executable,args,env){
 const result=spawnSync(executable,args,{cwd:root,env,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.error||result.status!==0)fail('ANDROID_COMMAND_FAILED');
 return result.stdout||'';
}
function privateDirectory(path){
 if(existsSync(path)&&lstatSync(path).isSymbolicLink())fail('ANDROID_DIRECTORY_LINK_REFUSED');
 mkdirSync(path,{recursive:true,mode:0o700});
}
try{
 if(options.some(option=>!['--offline','--skip-build'].includes(option)))fail('ANDROID_ARGUMENT_INVALID');
 const jdk=process.env.JAVA_HOME||'C:\\Program Files\\Android\\Android Studio\\jbr';
 const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'Android','Sdk');
 const java=join(jdk,'bin',process.platform==='win32'?'java.exe':'java');
 const keytool=join(jdk,'bin',process.platform==='win32'?'keytool.exe':'keytool');
 const wrapper=resolve(root,'android/gradle/wrapper/gradle-wrapper.jar');
 if(!existsSync(java)||!existsSync(keytool))fail('ANDROID_JDK_MISSING');
 if(!existsSync(wrapper)||!existsSync(join(sdk,'platforms','android-36','android.jar')))fail('ANDROID_SDK_OR_WRAPPER_MISSING');
 const buildTools=readdirSync(join(sdk,'build-tools')).filter(name=>/^\d+\.\d+\.\d+$/.test(name)).sort((a,b)=>a==='36.1.0'?-1:b==='36.1.0'?1:b.localeCompare(a,undefined,{numeric:true}));
 const tools=buildTools.map(name=>join(sdk,'build-tools',name)).find(path=>existsSync(join(path,'lib','apksigner.jar'))&&existsSync(join(path,process.platform==='win32'?'aapt2.exe':'aapt2')));
 if(!tools)fail('ANDROID_SIGNING_TOOLS_MISSING');
 const env={...process.env,JAVA_HOME:jdk,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk};
 if(!options.includes('--skip-build'))run(java,['-cp',wrapper,'org.gradle.wrapper.GradleWrapperMain','-p','android','--no-daemon',...(options.includes('--offline')?['--offline']:[]),'assembleRelease'],env);
 const unsigned=resolve(root,'android/app/build/outputs/apk/release/app-release-unsigned.apk');
 if(!existsSync(unsigned))fail('ANDROID_UNSIGNED_APK_MISSING');
 const signingDir=resolve(root,'.android-signing');privateDirectory(signingDir);
 const configPath=join(signingDir,'config.json'),keyPath=join(signingDir,'petcore-release.p12');
 for(const path of [configPath,keyPath])if(existsSync(path)&&lstatSync(path).isSymbolicLink())fail('ANDROID_SIGNING_LINK_REFUSED');
 let config;
 if(existsSync(configPath)){
  try{config=JSON.parse(readFileSync(configPath,'utf8'));}catch{fail('ANDROID_SIGNING_CONFIG_INVALID');}
  if(config.alias!=='petcore'||typeof config.password!=='string'||!/^[a-f0-9]{64}$/.test(config.password)||!['pending','ready'].includes(config.state))fail('ANDROID_SIGNING_CONFIG_INVALID');
  if(config.state==='ready'&&!existsSync(keyPath))fail('ANDROID_SIGNING_KEY_MISSING_RECOVER_BACKUP');
 }else{
  if(existsSync(keyPath))fail('ANDROID_SIGNING_CONFIG_MISSING_RECOVER_BACKUP');
  config={alias:'petcore',password:randomBytes(32).toString('hex'),state:'pending',createdAt:new Date().toISOString()};
  writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 const signEnv={...env,PETCORE_APK_SIGN_PASSWORD:config.password};
 if(!existsSync(keyPath))run(keytool,['-genkeypair','-alias',config.alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=PetCore,O=Tiger Tech,C=BR','-storetype','PKCS12','-keystore',keyPath,'-storepass:env','PETCORE_APK_SIGN_PASSWORD','-keypass:env','PETCORE_APK_SIGN_PASSWORD','-noprompt'],signEnv);
 run(keytool,['-list','-keystore',keyPath,'-alias',config.alias,'-storepass:env','PETCORE_APK_SIGN_PASSWORD'],signEnv);
 if(config.state!=='ready'){config.state='ready';writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});}
 const releaseDir=resolve(root,'releases');privateDirectory(releaseDir);
 const aapt=join(tools,process.platform==='win32'?'aapt2.exe':'aapt2');
 const info=spawnSync(aapt,['dump','badging',unsigned],{encoding:'utf8',windowsHide:true});
 if(info.status!==0||!info.stdout.includes("package: name='br.dev.tigertech.petcore'")||info.stdout.includes('application-debuggable'))fail('ANDROID_RELEASE_MANIFEST_INVALID');
 const minSdk=Number(/(?:minSdkVersion|sdkVersion):'(\d+)'/.exec(info.stdout)?.[1]);
 const targetSdk=Number(/targetSdkVersion:'(\d+)'/.exec(info.stdout)?.[1]);
 if(minSdk!==26||targetSdk!==36)fail('ANDROID_RELEASE_SDK_INVALID');
 const version=/versionName='([^']+)'/.exec(info.stdout)?.[1],versionCode=/versionCode='(\d+)'/.exec(info.stdout)?.[1];
 if(!version||!/^\d+(?:\.\d+){1,3}(?:-[a-zA-Z0-9.-]+)?$/.test(version)||!versionCode)fail('ANDROID_VERSION_INVALID');
 const apk=join(releaseDir,'PetCore-'+version+'.apk'),signer=join(tools,'lib','apksigner.jar');
 for(const path of [apk,apk+'.sha256',apk+'.json'])if(existsSync(path)&&lstatSync(path).isSymbolicLink())fail('ANDROID_RELEASE_LINK_REFUSED');
 run(java,['-jar',signer,'sign','--ks',keyPath,'--ks-key-alias',config.alias,'--ks-pass','env:PETCORE_APK_SIGN_PASSWORD','--key-pass','env:PETCORE_APK_SIGN_PASSWORD','--v4-signing-enabled','false','--out',apk,unsigned],signEnv);
 const verified=run(java,['-jar',signer,'verify','--verbose','--print-certs',apk],env);
 const sha256=createHash('sha256').update(readFileSync(apk)).digest('hex');
 writeFileSync(apk+'.sha256',sha256+'  '+apk.split(/[\\/]/).at(-1)+'\n');
 writeFileSync(apk+'.json',JSON.stringify({applicationId:'br.dev.tigertech.petcore',version,versionCode:Number(versionCode),minSdk,targetSdk,bytes:statSync(apk).size,sha256,certificateSha256:/certificate SHA-256 digest:\s*([^\r\n]+)/.exec(verified)?.[1]||null,signed:true,debuggable:false,requiresInternet:true,builtAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({ok:true,event:'android_apk_ready',apk,bytes:statSync(apk).size,sha256,signingMaterialShared:false}));
}catch(error){
 console.error(JSON.stringify({ok:false,code:typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'ANDROID_BUILD_FAILED'}));process.exitCode=1;
}
