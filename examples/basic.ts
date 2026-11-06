import mongoose from 'mongoose';
import { z } from 'zod';
import { createUserDomain, defineAccessControl } from '../src/index.js';

const accessControl = defineAccessControl({
  permissions: {
    'users.read': { title: 'مشاهده کاربران' },
    'orders.cancel': { title: 'لغو سفارش', category: 'orders' },
  },
});

export const users = createUserDomain({
  connection: mongoose.connection,
  accessControl,
  scope: { mode: 'required' },
  extraSchema: z.object({ preferredLanguage: z.enum(['fa', 'en']).optional() }).strict(),
});
