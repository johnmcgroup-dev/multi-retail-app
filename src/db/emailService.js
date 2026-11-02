// emailService.js
//
// The ONE place that sends email. There is no server yet, so nothing can
// actually be sent from here: the "email" is simulated and the code is handed
// straight back so the screen can show it (clearly labelled as development
// mode). That means that RIGHT NOW the code proves the flow works, but it does
// not prove the person owns the address.
//
// When the cloud layer exists, replace the body of this function with a call to
// a real email service (e.g. AWS SES) and return { delivered: true } without
// the code. Nothing else in the app needs to change.
export async function sendVerificationEmail({ email, code }) {
  void email;
  return { delivered: false, devCode: code };
}
