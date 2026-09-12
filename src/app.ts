import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { loadOpenApiSpec } from './docs';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/requireAuth';
import { authRouter } from './modules/auth/auth.routes';
import { budgetRouter } from './modules/budgets/budget.routes';
import { categoryRouter } from './modules/categories/category.routes';
import { expenseRouter } from './modules/expenses/expense.routes';
import { householdRouter } from './modules/households/household.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { recurringExpenseRouter } from './modules/recurringExpenses/recurringExpense.routes';
import { savingsGoalRouter } from './modules/savingsGoals/savingsGoal.routes';
import { userRouter } from './modules/users/user.routes';
import { healthRouter } from './routes/health';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins ?? true }));
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(loadOpenApiSpec()));
  app.use('/auth', authRouter);

  app.use('/categories', requireAuth, categoryRouter);
  app.use('/expenses', requireAuth, expenseRouter);
  app.use('/budgets', requireAuth, budgetRouter);
  app.use('/recurring-expenses', requireAuth, recurringExpenseRouter);
  app.use('/notifications', requireAuth, notificationRouter);
  app.use('/savings-goals', requireAuth, savingsGoalRouter);
  app.use('/households', requireAuth, householdRouter);
  app.use('/users', requireAuth, userRouter);

  app.use(errorHandler);

  return app;
}

