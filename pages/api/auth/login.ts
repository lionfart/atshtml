import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../src/lib/database";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { serialize } from "cookie";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "secret_key_change_me");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).end();

    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Kullanıcı adı ve şifre gereklidir." });
    }

    const db = await getDb();

    // 1. Find User (Lawyer or maybe a hardcoded Admin for bootstrap?)
    let user = db.data?.lawyers.find((u) => u.username === username);

    // --- BOOTSTRAP CHECK ---
    // If 'admin' user doesn't exist, allow creating it with password 'admin'
    // This allows recovery/initial setup even if other lawyers exist.
    if (!user && username === 'admin' && password === 'admin') {
        const hash = await bcrypt.hash('admin', 10);
        user = {
            id: 'admin_id',
            name: 'Administrator',
            username: 'admin',
            password_hash: hash,
            role: 'ADMIN',
            status: 'ACTIVE',
            missed_assignments_count: 0,
            assigned_files_count: 0
        };
        // Add to DB
        db.data?.lawyers.push(user);
        await db.write();
        console.log("Bootstrapped Admin User (Recovery Mode)");
    }

    if (!user) {
        return res.status(401).json({ error: "Geçersiz kullanıcı adı veya şifre." });
    }

    // 2. Verify Password
    if (!user.password_hash) {
        return res.status(401).json({ error: "Şifre ayarlanmamış." });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
        return res.status(401).json({ error: "Geçersiz kullanıcı adı veya şifre." });
    }

    // 3. Generate Token
    const token = await new SignJWT({ sub: user.id, role: user.role, name: user.name })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(JWT_SECRET);

    // 4. Set Cookie
    res.setHeader(
        "Set-Cookie",
        serialize("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24, // 1 day
            path: "/",
            sameSite: "lax",
        })
    );

    return res.status(200).json({ success: true, role: user.role, id: user.id });
}
