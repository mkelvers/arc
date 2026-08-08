import { env } from '$env/dynamic/private';

interface TurnstileResponse {
  success: boolean;
}

export async function verifyTurnstile(token: FormDataEntryValue | null, remoteIp?: string) {
  if (typeof token !== 'string' || !token || !env.TURNSTILE_SECRET) return false;

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    if (!response.ok) return false;
    return ((await response.json()) as TurnstileResponse).success === true;
  } catch {
    return false;
  }
}
