export interface Env {
    DB: D1Database;
    JWT_SECRET: string;
    ORDER_JSON_URL: string;
}

interface User {
    id: number;
    email: string;
    password_hash: string;
    nickname: string | null;
    is_customer: number;
    order_id: string | null;
    serial_numbers: string | null;
    created_at: number;
}

interface Comment {
    id: number;
    user_id: number;
    page_id: string;
    content: string;
    created_at: number;
    nickname: string | null;
    email: string;
}

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateToken(userId: number, secret: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${userId}:${timestamp}:${Math.random().toString(36).substring(7)}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(payload + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `${payload}:${hash.substring(0, 16)}`;
}

async function verifyToken(token: string, secret: string): Promise<number | null> {
    const parts = token.split(':');
    if (parts.length !== 4) return null;
    const [userId, timestamp, random, hash] = parts;
    const expectedPayload = `${userId}:${timestamp}:${random}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(expectedPayload + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== expectedHash.substring(0, 16)) return null;
    const tokenAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (tokenAge > 7 * 24 * 60 * 60) return null;
    return parseInt(userId);
}

async function fetchOrderList(url: string): Promise<Record<string, any>> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch order list');
    }
    return await response.json() as Record<string, any>;
}

function jsonResponse(data: any, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

function errorResponse(message: string, status = 400): Response {
    return jsonResponse({ error: message }, status);
}

async function getUserFromRequest(request: Request, env: Env): Promise<User | null> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.substring(7);
    const userId = await verifyToken(token, env.JWT_SECRET);
    if (!userId) return null;
    const result = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<User>();
    return result || null;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                },
            });
        }

        try {
            if (path === '/api/register' && request.method === 'POST') {
                const body = await request.json() as { email: string; password: string; nickname?: string };
                if (!body.email || !body.password) {
                    return errorResponse('邮箱和密码不能为空');
                }
                if (!body.email.includes('@')) {
                    return errorResponse('请输入有效的邮箱地址');
                }
                if (body.password.length < 6) {
                    return errorResponse('密码至少需要6位');
                }
                const passwordHash = await hashPassword(body.password);
                try {
                    const result = await env.DB.prepare(
                        'INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)'
                    ).bind(body.email, passwordHash, body.nickname || body.email.split('@')[0]).run();
                    return jsonResponse({ success: true, message: '注册成功' });
                } catch (e: any) {
                    if (e.message?.includes('UNIQUE constraint')) {
                        return errorResponse('该邮箱已被注册');
                    }
                    throw e;
                }
            }

            if (path === '/api/login' && request.method === 'POST') {
                const body = await request.json() as { email: string; password: string };
                if (!body.email || !body.password) {
                    return errorResponse('邮箱和密码不能为空');
                }
                const passwordHash = await hashPassword(body.password);
                const user = await env.DB.prepare(
                    'SELECT * FROM users WHERE email = ? AND password_hash = ?'
                ).bind(body.email, passwordHash).first<User>();
                if (!user) {
                    return errorResponse('邮箱或密码错误');
                }
                const token = await generateToken(user.id, env.JWT_SECRET);
                await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?')
                    .bind(Math.floor(Date.now() / 1000), user.id).run();
                return jsonResponse({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        nickname: user.nickname,
                        is_customer: user.is_customer === 1,
                    },
                });
            }

            if (path === '/api/me' && request.method === 'GET') {
                const user = await getUserFromRequest(request, env);
                if (!user) {
                    return errorResponse('未登录', 401);
                }
                return jsonResponse({
                    id: user.id,
                    email: user.email,
                    nickname: user.nickname,
                    is_customer: user.is_customer === 1,
                    order_id: user.order_id,
                });
            }

            if (path === '/api/activate' && request.method === 'POST') {
                const user = await getUserFromRequest(request, env);
                if (!user) {
                    return errorResponse('请先登录', 401);
                }
                const body = await request.json() as { order_id: string; serial_numbers: string };
                if (!body.order_id || !body.serial_numbers) {
                    return errorResponse('订单号和序列号不能为空');
                }
                const serialList = body.serial_numbers.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 4);
                if (serialList.length === 0 || serialList.length > 3) {
                    return errorResponse('请输入1-3个序列号后4位');
                }
                const orderList = await fetchOrderList(env.ORDER_JSON_URL);
                const orderValue = orderList[body.order_id];
                if (orderValue === undefined) {
                    return errorResponse('订单号不存在');
                }
                await env.DB.prepare(
                    'UPDATE users SET is_customer = 1, order_id = ?, serial_numbers = ? WHERE id = ?'
                ).bind(body.order_id, serialList.join(','), user.id).run();
                return jsonResponse({
                    success: true,
                    message: '激活成功',
                    serial_numbers: serialList,
                });
            }

            if (path === '/api/comments' && request.method === 'GET') {
                const pageId = url.searchParams.get('page') || 'index';
                const limit = parseInt(url.searchParams.get('limit') || '50');
                const comments = await env.DB.prepare(`
                    SELECT c.id, c.user_id, c.page_id, c.content, c.created_at, u.nickname, u.email
                    FROM comments c
                    JOIN users u ON c.user_id = u.id
                    WHERE c.page_id = ?
                    ORDER BY c.created_at DESC
                    LIMIT ?
                `).bind(pageId, limit).all<Comment>();
                return jsonResponse({ comments: comments.results });
            }

            if (path === '/api/comments' && request.method === 'POST') {
                const user = await getUserFromRequest(request, env);
                if (!user) {
                    return errorResponse('请先登录', 401);
                }
                const body = await request.json() as { page_id: string; content: string };
                if (!body.page_id || !body.content) {
                    return errorResponse('页面ID和评论内容不能为空');
                }
                if (body.content.length > 500) {
                    return errorResponse('评论内容不能超过500字');
                }
                const result = await env.DB.prepare(
                    'INSERT INTO comments (user_id, page_id, content) VALUES (?, ?, ?)'
                ).bind(user.id, body.page_id, body.content).run();
                return jsonResponse({ success: true, message: '评论成功' });
            }

            if (path === '/api/comments' && request.method === 'DELETE') {
                const user = await getUserFromRequest(request, env);
                if (!user) {
                    return errorResponse('请先登录', 401);
                }
                const commentId = url.searchParams.get('id');
                if (!commentId) {
                    return errorResponse('评论ID不能为空');
                }
                const comment = await env.DB.prepare(
                    'SELECT user_id FROM comments WHERE id = ?'
                ).bind(commentId).first();
                if (!comment) {
                    return errorResponse('评论不存在');
                }
                if (comment.user_id !== user.id) {
                    return errorResponse('只能删除自己的评论', 403);
                }
                await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run();
                return jsonResponse({ success: true, message: '删除成功' });
            }

            if (path === '/api/verify-order' && request.method === 'POST') {
                const body = await request.json() as { order_id: string };
                if (!body.order_id) {
                    return errorResponse('订单号不能为空');
                }
                const orderList = await fetchOrderList(env.ORDER_JSON_URL);
                const exists = body.order_id in orderList;
                return jsonResponse({ exists });
            }

            return errorResponse('Not Found', 404);
        } catch (error: any) {
            console.error('Error:', error);
            return errorResponse('服务器错误: ' + error.message, 500);
        }
    },
};
