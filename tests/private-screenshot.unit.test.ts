import {it,expect} from 'vitest';
import {inflateSync,crc32} from 'node:zlib';
import {privateScreenshot} from '../src/main/private-screenshot';
const sample=()=>Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
it('emits a valid opaque PNG derivative without copying original pixel or trailing content',()=>{
 const original=Buffer.concat([sample(),Buffer.from('PRIVATE_SOURCE_CONTENT')]),redacted=privateScreenshot(original);expect(redacted.includes(Buffer.from('PRIVATE_SOURCE_CONTENT'))).toBe(false);
 let offset=8;const compressed:Buffer[]=[];while(offset<redacted.length){const size=redacted.readUInt32BE(offset),type=redacted.toString('ascii',offset+4,offset+8),body=redacted.subarray(offset+4,offset+8+size);expect(redacted.readUInt32BE(offset+8+size)).toBe(crc32(body));if(type==='IDAT')compressed.push(redacted.subarray(offset+8,offset+8+size));offset+=size+12;}
 expect(inflateSync(Buffer.concat(compressed))).toEqual(Buffer.from([0,17,19,24,255]));
});
it('rejects oversized or malformed native screenshot headers before allocation',()=>{
 const oversized=sample();oversized.writeUInt32BE(100000,16);expect(()=>privateScreenshot(oversized)).toThrow('safety limit');expect(()=>privateScreenshot(Buffer.from('not a PNG'))).toThrow('Invalid');
 const zero=sample();zero.writeUInt32BE(0,20);expect(()=>privateScreenshot(zero)).toThrow('safety limit');
});
