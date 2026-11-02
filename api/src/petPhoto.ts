import sharp from 'sharp';
sharp.cache({memory:16,files:0,items:20});
sharp.concurrency(2);

export async function preparePetPhoto(bytes:Buffer) {
 const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(bytes.length>5*1024*1024||!jpeg&&!png&&!webp)throw Object.assign(new Error('Envie uma foto JPEG, PNG ou WebP de até 5 MB.'),{status:422});
 try {
  const body=await sharp(bytes,{limitInputPixels:16000000,failOn:'error',animated:false}).rotate()
   .resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();
  // Sharp omits EXIF, location and other embedded metadata unless explicitly kept.
  return {body,mime:'image/webp',extension:'webp'};
 }catch{throw Object.assign(new Error('Não foi possível ler a foto. Escolha outra imagem de até 16 milhões de pixels.'),{status:422});}
}
