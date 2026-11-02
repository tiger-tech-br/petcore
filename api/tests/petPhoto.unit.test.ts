import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {preparePetPhoto} from '../src/petPhoto.ts';

test('foto normalizada remove metadados pessoais e limita as dimensões',async()=>{
 const input=await sharp({create:{width:2000,height:1000,channels:3,background:'#eee'}}).withExif({IFD0:{Artist:'Pessoa de teste',ImageDescription:'Informação pessoal de teste'}}).jpeg().toBuffer();
 assert.ok((await sharp(input).metadata()).exif);
 const photo=await preparePetPhoto(input),metadata=await sharp(photo.body).metadata();
 assert.equal(photo.mime,'image/webp');assert.equal(metadata.width,1600);assert.equal(metadata.height,800);assert.equal(metadata.exif,undefined);assert.equal(metadata.xmp,undefined);
});
test('assinatura de arquivo falsa não é aceita como foto válida',async()=>{
 await assert.rejects(preparePetPhoto(Buffer.from([255,216,255,1,2,3,4,5])),{status:422});
 await assert.rejects(preparePetPhoto(Buffer.from('<svg onload="alert(1)"></svg>')),{status:422});
});
