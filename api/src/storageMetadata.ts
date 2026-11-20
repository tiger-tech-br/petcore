// HTTP header names use hyphens. Read historical underscore metadata without
// accepting two contradictory ownership markers on the same stored object.
export function readStorageMetadata(metadata:Readonly<Record<string,string>>|undefined,name:string):string|undefined{
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))throw Object.assign(new Error('STORAGE_METADATA_KEY_INVALID'),{code:'STORAGE_METADATA_KEY_INVALID'});
 if(!metadata)return undefined;
 const legacy=name.replaceAll('-','_');
 const current=Object.hasOwn(metadata,name)?metadata[name]:undefined,previous=Object.hasOwn(metadata,legacy)?metadata[legacy]:undefined;
 if(current!==undefined&&typeof current!=='string'||previous!==undefined&&typeof previous!=='string')throw Object.assign(new Error('STORAGE_METADATA_VALUE_INVALID'),{code:'STORAGE_METADATA_VALUE_INVALID'});
 if(current!==undefined&&previous!==undefined&&current!==previous)throw Object.assign(new Error('STORAGE_METADATA_CONFLICT'),{code:'STORAGE_METADATA_CONFLICT'});
 return current??previous;
}
