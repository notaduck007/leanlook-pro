import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { HardHat, Eye, EyeOff } from "lucide-react";
import { validatePassword } from "@/lib/password";

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const ALLOWED_DOMAIN = "anslowbryant.com";
  const isAllowedEmail = (e: string) =>
    e.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

  const handleMicrosoftSignIn = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: "anslowbryant.com",
    });
    if (error) {
      toast({
        title: "Microsoft sign-in failed",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (forgotPassword) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Check your email", description: "We sent you a password reset link." });
        setForgotPassword(false);
      }
    } else if (isSignUp) {
      if (!isAllowedEmail(email)) {
        toast({
          title: "Access restricted",
          description: "Only Anslow Bryant (@anslowbryant.com) accounts can access LeanLook.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      const pwErr = validatePassword(password);
      if (pwErr) {
        toast({ title: "Error", description: pwErr, variant: "destructive" });
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else if (!data.session) {
        // Supabase returns an obfuscated user with EMPTY `identities` when
        // the email is already registered, to avoid leaking account existence.
        // No confirmation email is sent in that case, so don't tell the user
        // to check their inbox.
        const identities = (data.user as any)?.identities;
        if (Array.isArray(identities) && identities.length === 0) {
          toast({
            title: "Email already registered",
            description: "This email is already registered — try signing in or resetting your password.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Check your email", description: "Confirm your account before signing in." });
          setIsSignUp(false);
        }
      } else {
        toast({ title: "Account created!", description: "You can now sign in." });
        setIsSignUp(false);
      }
    } else {
      if (!isAllowedEmail(email)) {
        toast({
          title: "Access restricted",
          description: "Only Anslow Bryant (@anslowbryant.com) accounts can access LeanLook.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <HardHat className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">LeanLook</CardTitle>
          <CardDescription>
              {forgotPassword ? "Enter your email to reset your password" : isSignUp ? "Create your account" : "Sign in to your account"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!forgotPassword && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleMicrosoftSignIn}
                disabled={loading}
                className="w-full min-h-11 gap-2"
                aria-label="Sign in with Microsoft"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022" />
                  <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00" />
                  <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF" />
                  <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" />
                </svg>
                Sign in with Microsoft
              </Button>
              <div className="my-4 flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && !forgotPassword && (
              <div className="space-y-1">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  placeholder="Display name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {!forgotPassword && (
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : forgotPassword ? "Send Reset Link" : isSignUp ? "Create Account" : "Sign In"}
            </Button>
          </form>
          {!forgotPassword && !isSignUp && (
            <div className="mt-2 text-center">
              <button
                onClick={() => setForgotPassword(true)}
                className="text-sm text-muted-foreground hover:text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {forgotPassword ? (
              <button
                onClick={() => setForgotPassword(false)}
                className="text-primary hover:underline font-medium"
              >
                Back to sign in
              </button>
            ) : (
              <>
                {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-primary hover:underline font-medium"
                >
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
