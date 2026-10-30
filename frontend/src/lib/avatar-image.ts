const OUTPUT_SIZE = 512;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export class AvatarImageError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AvatarImageError('Não conseguimos abrir essa foto. Tente outra, em JPG ou PNG.'));
    };
    image.src = url;
  });
}

/**
 * Recorta o centro da foto em quadrado e reduz para 512 px em JPEG.
 * Assim a foto sobe leve mesmo vinda direto da câmera do celular.
 */
export async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new AvatarImageError('Escolha uma foto. Esse arquivo não é imagem.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AvatarImageError('A foto passou de 15 MB. Escolha uma imagem menor.');
  }
  const image = await loadImage(file);
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (side < 64) {
    throw new AvatarImageError('A foto é pequena demais. Use uma imagem com pelo menos 64 px.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new AvatarImageError('Seu navegador não conseguiu preparar a foto.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  return canvas.toDataURL('image/jpeg', 0.86);
}
