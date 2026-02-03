import NextAuth, { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // TODO: Replace with actual database authentication
        // This is a placeholder for demo purposes
        if (
          credentials?.email === 'demo@reihub.com' &&
          credentials?.password === 'demo123'
        ) {
          return {
            id: '1',
            email: 'demo@reihub.com',
            name: 'Demo User',
            role: 'admin',
          }
        }

        // In production, verify against your database
        // const user = await prisma.user.findUnique({
        //   where: { email: credentials?.email }
        // })
        // if (user && await bcrypt.compare(credentials.password, user.password)) {
        //   return user
        // }

        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        (session.user as any).id = token.id
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
