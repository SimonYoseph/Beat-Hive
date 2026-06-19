import NextAuth from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";
import GoogleProvider from "next-auth/providers/google";

const authOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID || "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
      authorization: "https://accounts.spotify.com/authorize?scope=user-read-email,user-read-playback-state,user-modify-playback-state,user-read-currently-playing,streaming",
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: "https://accounts.google.com/o/oauth2/auth?scope=https://www.googleapis.com/auth/youtube.readonly%20profile%20email",
    }),
  ],
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, account }: any) {
      // Persist the OAuth access_token right after signin
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      // Send properties to the client, like an access_token from a provider.
      session.accessToken = token.accessToken;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "default_development_secret_do_not_use_in_production",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };