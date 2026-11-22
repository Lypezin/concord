import { z } from 'zod';

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Usuário precisa ter pelo menos 3 caracteres')
  .max(24, 'Usuário pode ter no máximo 24 caracteres')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ponto, traço ou sublinhado');

const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Nome de exibição é obrigatório')
  .max(32, 'Nome de exibição pode ter no máximo 32 caracteres');

const passwordSchema = z
  .string()
  .min(6, 'Senha precisa ter pelo menos 6 caracteres')
  .max(100, 'Senha muito longa');

export const setupAdminSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Informe seu usuário'),
  password: z.string().min(1, 'Informe sua senha'),
});

export const registerSchema = z.object({
  inviteCode: z.string().trim().min(4, 'Código de convite inválido').max(64),
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nome do canal é obrigatório')
    .max(32, 'Nome do canal pode ter no máximo 32 caracteres'),
  type: z.enum(['text', 'voice']),
});

export const updateChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nome do canal é obrigatório')
    .max(32, 'Nome do canal pode ter no máximo 32 caracteres'),
});

export const createMessageSchema = z
  .object({
    content: z.string().max(4000, 'Mensagem pode ter no máximo 4000 caracteres').default(''),
    attachmentIds: z.array(z.string().min(1)).max(5, 'Máximo de 5 anexos por mensagem').optional(),
  })
  .refine(
    (data) => data.content.trim().length > 0 || (data.attachmentIds !== undefined && data.attachmentIds.length > 0),
    { message: 'Envie um texto ou pelo menos um anexo' },
  );

export const editMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'A mensagem não pode ficar vazia')
    .max(4000, 'Mensagem pode ter no máximo 4000 caracteres'),
});

export const toggleReactionSchema = z.object({
  emoji: z.string().trim().min(1, 'Emoji inválido').max(16),
});

export const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(10).default(1),
  expiresInHours: z.number().int().min(1).max(720).nullable().optional(),
});

export const voiceTokenSchema = z.object({
  channelId: z.string().min(1, 'Canal de voz inválido'),
});

export type SetupAdminInput = z.infer<typeof setupAdminSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type VoiceTokenInput = z.infer<typeof voiceTokenSchema>;
