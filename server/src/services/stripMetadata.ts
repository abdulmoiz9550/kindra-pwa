/**
 * Addendum v4.2, secciones 10.6 y 13: toda foto se guarda sin metadatos (EXIF con GPS, XMP, IPTC, comentarios).
 * Sin dependencias: recorre los segmentos del archivo y quita los que llevan metadatos; la imagen no se recodifica.
 */
export function stripImageMetadata(buf: Buffer, ext: string): Buffer {
  try {
    if (ext === 'jpg' || ext === 'jpeg') return stripJpeg(buf);
    if (ext === 'png') return stripPng(buf);
    if (ext === 'webp') return stripWebp(buf);
  } catch {
    // Archivo con estructura inesperada: se rechaza antes que guardarlo con posibles metadatos.
    throw new Error('metadata');
  }
  return buf;
}

/** JPEG: conserva APP0 (JFIF), APP2 (perfil de color) y APP14 (Adobe); quita APP1 (EXIF/XMP), APP3–APP13, APP15 y COM. */
function stripJpeg(buf: Buffer): Buffer {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('jpeg');
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('jpeg');
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Inicio de los datos de la imagen: el resto se copia tal cual.
    if (marker === 0xda) {
      out.push(buf.subarray(i));
      break;
    }
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = !(marker === 0xfe || (isApp && ![0xe0, 0xe2, 0xee].includes(marker)));
    if (keep) out.push(seg);
    i += 2 + len;
  }
  return Buffer.concat(out);
}

/** PNG: quita eXIf, tEXt, zTXt, iTXt y tIME. */
function stripPng(buf: Buffer): Buffer {
  const sig = buf.subarray(0, 8);
  if (sig.toString('hex') !== '89504e470d0a1a0a') throw new Error('png');
  const out: Buffer[] = [sig];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const chunk = buf.subarray(i, i + 12 + len);
    if (!['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'].includes(type)) out.push(chunk);
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

/** WebP: quita los bloques EXIF y XMP y apaga sus marcas en VP8X. */
function stripWebp(buf: Buffer): Buffer {
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(8, 12).toString('latin1') !== 'WEBP') throw new Error('webp');
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.subarray(i, i + 4).toString('latin1');
    const len = buf.readUInt32LE(i + 4);
    const total = 8 + len + (len % 2);
    let chunk = Buffer.from(buf.subarray(i, i + total));
    if (type === 'VP8X') chunk[8] &= ~(0x08 | 0x04);
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(chunk);
    i += total;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}
