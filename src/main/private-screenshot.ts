import {crc32, deflateSync} from 'node:zlib';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(type:string,data:Buffer) {
 const kind=Buffer.from(type,'ascii'),size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([kind,data])));
 return Buffer.concat([size,kind,data,checksum]);
}
// A fully opaque derivative, NOT a content screenshot. Never rely on page DOM/CSS
// bounds for privacy. The original browser PNG remains in memory and is never written.
// This bounded PNG encoder uses standard PNG framing, zlib and Node's native CRC32;
// it decodes no untrusted pixels and implements no cryptographic primitives.
export function privateScreenshot(original:Buffer):Buffer {
 if(original.length<33||!original.subarray(0,8).equals(signature)||original.toString('ascii',12,16)!=='IHDR'||original.readUInt32BE(8)!==13)throw Error('Invalid browser screenshot');
 const width=original.readUInt32BE(16),height=original.readUInt32BE(20);
 if(!width||!height||width>7680||height>4320||width*height>16_777_216)throw Error('Screenshot exceeds privacy-image safety limit');
 const row=Buffer.alloc(width*4+1);for(let x=1;x<row.length;x+=4){row[x]=17;row[x+1]=19;row[x+2]=24;row[x+3]=255;}
 const raw=Buffer.alloc(row.length*height);for(let y=0;y<height;y++)row.copy(raw,y*row.length);
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
