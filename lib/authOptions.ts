import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { dbConnect } from '@/lib/db';
import UserExtra from '@/models/UserExtra';
import { compare } from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: { username: { label: 'Username', type: 'text' }, password: { label: 'Password', type: 'password' } },
      async authorize(credentials) {
        const username = credentials?.username?.toLowerCase();
        const password = credentials?.password || '';
        if (!username || !password) return null;
        await dbConnect();
        const user = await UserExtra.findOne({  $or: [
          { name: new RegExp(`^${username}$`, "i") },
          { email: new RegExp(`^${username}$`, "i") }
        ] });
        if (!user || !user.hashedPassword) return null;
        const ok = await compare(password, user.hashedPassword);
        if (!ok) return null;
        return { id: user._id.toString(), email: user.email, name: user.name || user.email, role: user.role } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as any).id;
        token.role = (user as any).role || 'staff';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.uid as string;
        (session.user as any).role = (token.role as string) || 'staff';
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
};
