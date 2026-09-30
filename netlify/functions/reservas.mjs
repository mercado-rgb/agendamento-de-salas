// Função do Netlify que responde em /api/reservas (GET lista, POST reserva, DELETE cancela).
// Os dados ficam no Netlify Blobs, o armazenamento do próprio Netlify (não precisa de banco externo).
import { getStore } from '@netlify/blobs';
import { criarHandler } from '../lib/core.mjs';

export default criarHandler(() => getStore({ name: 'reservas-salas', consistency: 'strong' }));

export const config = { path: '/api/reservas' };
