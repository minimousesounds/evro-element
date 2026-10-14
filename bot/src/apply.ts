// Превращает подтверждённый план в файлы для коммита.
import { addImage, newProductMd, setCategory, setInStock, setPrice, setText } from './content';
import type { FileChange } from './github';
import type { Plan } from './plan';

export interface PhotoFile {
  base64: string;
  ext: 'jpg' | 'png' | 'webp';
}

/**
 * @param readText чтение актуальной версии файла из репозитория
 * @param photo фото из сообщения, если было
 * @param stamp метка для имени файла фото, чтобы не перезаписать старое
 */
export async function planToFiles(plan: Plan, readText: (path: string) => Promise<string>, photo: PhotoFile | undefined, stamp: string): Promise<FileChange[]> {
  const files: FileChange[] = [];
  const photoFor = (slug: string) => {
    const name = `${slug}-${stamp}.${photo!.ext}`;
    files.push({ path: `public/uploads/products/${name}`, content: photo!.base64, encoding: 'base64' });
    return `/uploads/products/${name}`;
  };

  for (const c of plan.changes) {
    if (c.kind === 'create') {
      const images = c.addPhoto && photo ? [photoFor(c.slug)] : [];
      files.push({ path: `src/content/products/${c.slug}.md`, content: newProductMd({ ...c.product, images }), encoding: 'utf-8' });
      continue;
    }
    // берём свежую версию файла: вдруг его успели поправить в админке
    let md = await readText(c.path);
    if (c.price != null) md = setPrice(md, c.price);
    if (c.inStock != null) md = setInStock(md, c.inStock);
    if (c.newTitle) md = setText(md, 'title', c.newTitle);
    if (c.brand) md = setText(md, 'brand', c.brand);
    if (c.productKind) md = setText(md, 'kind', c.productKind);
    if (c.category) md = setCategory(md, c.category);
    if (c.addPhoto && photo) md = addImage(md, photoFor(c.productId));
    files.push({ path: c.path, content: md, encoding: 'utf-8' });
  }
  return files;
}
