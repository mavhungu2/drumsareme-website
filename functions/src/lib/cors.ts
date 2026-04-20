export const ALLOWED_ORIGINS = [
  "https://drumsareme.co.za",
  "https://www.drumsareme.co.za",
  "https://drumsareme-website.web.app",
  "http://localhost:3000",
];

interface CorsRequest {
  get: (header: string) => string | undefined;
}

interface CorsResponse {
  set: (key: string, value: string) => void;
}

export function applyCors(
  req: CorsRequest,
  res: CorsResponse,
  methods: string,
): void {
  const origin = req.get("origin") ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", `${methods},OPTIONS`);
  res.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
}
