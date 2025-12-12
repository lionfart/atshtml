import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "secret_key_change_me");

// Routes that do NOT require authentication
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/favicon.ico'];

export async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;

    // 1. Allow Public Paths
    if (PUBLIC_PATHS.some(p => path.startsWith(p)) || path.match(/\.(png|jpg|jpeg|svg|css|js)$/)) {
        return NextResponse.next();
    }

    // 2. Check Token
    const token = req.cookies.get('auth_token')?.value;

    if (!token) {
        // Redirect to Login
        return NextResponse.redirect(new URL('/login', req.url));
    }

    try {
        // 3. Verify Token
        await jwtVerify(token, JWT_SECRET);
        return NextResponse.next();
    } catch (error) {
        // Invalid Token -> Login
        const response = NextResponse.redirect(new URL('/login', req.url));
        response.cookies.delete('auth_token'); // Clear bad token
        return response;
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/auth (auth routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         */
        '/((?!api/auth|_next/static|_next/image).*)',
    ],
};
