export const ACCESS_TOKEN_COOKIE = "cmip_access_token";
export const REFRESH_TOKEN_COOKIE = "cmip_refresh_token";

export const ADMIN_EMAIL_DEFAULT = "kahensolution@gmail.com";

export function configuredAdminEmail() {
  return (process.env.ADMIN_EMAIL ?? ADMIN_EMAIL_DEFAULT).trim().toLowerCase();
}

