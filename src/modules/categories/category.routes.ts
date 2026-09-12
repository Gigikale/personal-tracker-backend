import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import * as categoryService from './category.service';
import { createCategorySchema, updateCategorySchema } from './category.schemas';

export const categoryRouter = Router();

categoryRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createCategorySchema.parse(req.body);
    const category = await categoryService.createCategory(req.userId!, input);
    res.status(201).json(category);
  }),
);

categoryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await categoryService.listCategories(req.userId!);
    res.status(200).json(categories);
  }),
);

categoryRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const category = await categoryService.getCategory(req.userId!, req.params.id);
    res.status(200).json(category);
  }),
);

categoryRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateCategorySchema.parse(req.body);
    const category = await categoryService.updateCategory(req.userId!, req.params.id, input);
    res.status(200).json(category);
  }),
);

categoryRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await categoryService.deleteCategory(req.userId!, req.params.id);
    res.status(204).send();
  }),
);
