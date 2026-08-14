import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <SignUp path="/signup" routing="path" signInUrl="/login" />
  );
}
