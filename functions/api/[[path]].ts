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
    const payload = `${userId}:${timestamp}:${random}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(payload + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    if (hash !== expectedHash) return null;
    return parseInt(userId);
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

async function fetchOrderList(url: string): Promise<Record<string, number>> {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch {
        return {};
    }
}

export async function onRequest(context: { request: Request; env: Env; params: Record<string, string> }) {
    const { request, env } = context;
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
            const result = await env.DB.prepare(
                'SELECT * FROM users WHERE email = ? AND password_hash = ?'
            ).bind(body.email, passwordHash).first<User>();
            if (!result) {
                return errorResponse('邮箱或密码错误');
            }
            const token = await generateToken(result.id, env.JWT_SECRET);
            return jsonResponse({
                success: true,
                token,
                user: {
                    id: result.id,
                    email: result.email,
                    nickname: result.nickname,
                    is_customer: result.is_customer === 1,
                    order_id: result.order_id,
                    serial_numbers: result.serial_numbers,
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
                serial_numbers: user.serial_numbers,
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
            const existingUser = await env.DB.prepare(
                'SELECT id FROM users WHERE order_id = ? AND id != ?'
            ).bind(body.order_id, user.id).first();
            if (existingUser) {
                return errorResponse('该订单号已被其他用户激活');
            }
            if (user.is_customer === 1 && user.order_id && user.order_id !== body.order_id) {
                return errorResponse('您已激活过其他订单，无法更换');
            }
            let finalSerialList = serialList;
            if (user.serial_numbers) {
                const existingSerials = user.serial_numbers.split(',');
                const mergedSerials = [...new Set([...existingSerials, ...serialList])];
                if (mergedSerials.length > 3) {
                    return errorResponse('序列号总数不能超过3个');
                }
                finalSerialList = mergedSerials;
            }
            await env.DB.prepare(
                'UPDATE users SET is_customer = 1, order_id = ?, serial_numbers = ? WHERE id = ?'
            ).bind(body.order_id, finalSerialList.join(','), user.id).run();
            return jsonResponse({
                success: true,
                message: '激活成功',
                serial_numbers: finalSerialList,
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
                return errorResponse('页面ID和内容不能为空');
            }
            if (body.content.length > 500) {
                return errorResponse('评论内容不能超过500字');
            }
            await env.DB.prepare(
                'INSERT INTO comments (user_id, page_id, content) VALUES (?, ?, ?)'
            ).bind(user.id, body.page_id, body.content).run();
            return jsonResponse({ success: true, message: '评论成功' });
        }

        if (path.startsWith('/api/comments/') && request.method === 'DELETE') {
            const user = await getUserFromRequest(request, env);
            if (!user) {
                return errorResponse('请先登录', 401);
            }
            const commentId = parseInt(path.split('/')[3]);
            if (isNaN(commentId)) {
                return errorResponse('无效的评论ID');
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
}
