import { z } from 'zod';
import { t } from './messages.js';
import { isMobileMethod, phoneFitsMethod } from './payment-rules.js';

const str = () => z.string({ required_error: 'required', invalid_type_error: 'required' });

const phone = str()
  .transform((s) => s.replace(/[\s\-().]/g, ''))
  .refine((s) => /^(\+?258)?8[2-7]\d{7}$/.test(s), { message: 'invalid_phone' })
  .transform((s) => '258' + s.replace(/^\+?258/, ''));

export const orderSchema = z.object({
  customer: z.object({
    name: str().trim().min(3, 'name_short').max(80, 'invalid'),
    phone,
    city: str().trim().min(2, 'city_required').max(60, 'invalid'),
    address: str().trim().min(8, 'address_short').max(240, 'invalid'),
    notes: z.string().trim().max(300, 'invalid').optional().default(''),
  }),
  paymentMethod: z.enum(['mpesa', 'emola', 'visa_card'], { errorMap: () => ({ message: 'invalid_payment' }) }),
  // Número que vai aprovar o pagamento (obrigatório em M-Pesa/e-Mola; pode ser diferente do contacto).
  paymentPhone: phone.optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        variantId: z.number().int().positive().nullable().optional(),
        qty: z.number().int().min(1, 'invalid').max(20, 'invalid'),
      }),
      { required_error: 'items_empty', invalid_type_error: 'items_empty' }
    )
    .min(1, 'items_empty')
    .max(30, 'invalid'),
}).superRefine((order, ctx) => {
  if (!isMobileMethod(order.paymentMethod)) return;
  if (!order.paymentPhone) {
    ctx.addIssue({ code: 'custom', path: ['paymentPhone'], message: 'payment_phone_required' });
  } else if (!phoneFitsMethod(order.paymentMethod, order.paymentPhone.slice(3))) {
    ctx.addIssue({ code: 'custom', path: ['paymentPhone'], message: order.paymentMethod === 'mpesa' ? 'phone_not_mpesa' : 'phone_not_emola' });
  }
});

export const contactSchema = z.object({
  name: str().trim().min(2, 'name_short').max(80, 'invalid'),
  email: str().trim().email('invalid_email').max(120, 'invalid'),
  message: str().trim().min(10, 'message_short').max(1000, 'invalid'),
});

export const newsletterSchema = z.object({
  email: str().trim().email('invalid_email').max(120, 'invalid'),
});

function fieldOf(path) {
  if (path[0] === 'customer') return String(path[1] ?? 'customer');
  return String(path[0] ?? 'form');
}

export function validate(schema, data, lang) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return { ok: true, data: result.data };
  const fields = {};
  for (const issue of result.error.issues) {
    const key = fieldOf(issue.path);
    if (!fields[key]) fields[key] = t(lang, issue.message);
  }
  return { ok: false, fields };
}
