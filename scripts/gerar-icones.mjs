// Gera os ícones do PWA a partir da logo (public/assets/obrix-logo.jpg).
// Uso: node scripts/gerar-icones.mjs
import sharp from 'sharp';

const ORIGEM = 'public/assets/obrix-logo.jpg';
// cor do fundo = cor do canto da própria imagem (evita "caixa" visível ao redor do símbolo)
const canto = await sharp(ORIGEM).extract({ left: 2, top: 2, width: 4, height: 4 }).raw().toBuffer();
const FUNDO = { r: canto[0], g: canto[1], b: canto[2] };
// área do símbolo (hexágono) dentro da imagem 1536x1024
const SIMBOLO = { left: 112, top: 268, width: 384, height: 420 };

const simbolo = await sharp(ORIGEM).extract(SIMBOLO).toBuffer();

async function icone(arquivo, tamanho, proporcao) {
  const miolo = Math.round(tamanho * proporcao);
  const img = await sharp(simbolo).resize(miolo, miolo, { fit: 'contain', background: FUNDO }).toBuffer();
  await sharp({ create: { width: tamanho, height: tamanho, channels: 3, background: FUNDO } })
    .composite([{ input: img, gravity: 'center' }]).png().toFile(`public/${arquivo}`);
  console.log('ok', arquivo);
}

await icone('icon-192.png', 192, 0.8);
await icone('icon-512.png', 512, 0.8);
await icone('icon-maskable-512.png', 512, 0.58); // área segura para ícones "maskable"
await icone('apple-touch-icon.png', 180, 0.8);
await icone('favicon-64.png', 64, 0.92);
