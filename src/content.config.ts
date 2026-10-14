import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const categories = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/categories' }),
  schema: z.object({
    title: z.string(),
    order: z.number().default(99),
    image: z.string().optional().default(''),
    seoTitle: z.string().optional().default(''),
    seoDescription: z.string().optional().default(''),
    oldId: z.number().optional(),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    sku: z.string(),
    brand: z.string().optional().default(''),
    // original — оригинал, analog — аналог, пусто — не указано
    kind: z.enum(['original', 'analog', '']).optional().default(''),
    category: reference('categories'),
    price: z.number(),
    inStock: z.boolean().default(true),
    popular: z.boolean().default(false),
    offer: z.boolean().default(false),
    images: z.array(z.string()).default([]),
    // номера других производителей, которые заменяет товар
    replaces: z.array(z.object({ brand: z.string(), number: z.string() })).default([]),
    specs: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
    country: z.string().optional().default(''),
    applicability: z.string().optional().default(''),
    seoTitle: z.string().optional().default(''),
    seoDescription: z.string().optional().default(''),
    oldId: z.number().optional(),
  }),
});

const tech = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/tech' }),
  schema: z.object({
    title: z.string(),
    parent: z.string().optional().default(''),
    order: z.number().default(0),
    // товары, которые подходят к технике со страницы; дополняют автоматический поиск по артикулам в тексте
    products: z.array(reference('products')).default([]),
    seoDescription: z.string().optional().default(''),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    seoDescription: z.string().optional().default(''),
  }),
});

export const collections = { categories, products, tech, pages };
