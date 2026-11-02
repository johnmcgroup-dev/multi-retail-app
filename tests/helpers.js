import { signUpAsNewTenantOwner, joinWithInviteCode, verifyEmail } from '../src/db/users';

// Most tests just need a working, logged-in account. These do the full real
// sign-up AND the email verification step, like a person would.
export async function signUpVerified(args) {
  const result = await signUpAsNewTenantOwner(args);
  await verifyEmail({ email: args.email, code: result.devCode });
  return result;
}

export async function joinVerified(args) {
  const result = await joinWithInviteCode(args);
  await verifyEmail({ email: args.email, code: result.devCode });
  return result;
}
