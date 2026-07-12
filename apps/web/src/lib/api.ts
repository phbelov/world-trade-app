import type {
  CountryTrend,
  CountryYearSummary,
  Meta,
} from "@world-trade/shared/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const fetchMeta = (): Promise<Meta> => get("/api/meta");

export const fetchSummary = (
  iso3: string,
  year?: number,
): Promise<CountryYearSummary> =>
  get(`/api/country/${iso3}${year ? `?year=${year}` : ""}`);

export const fetchTrend = (iso3: string): Promise<CountryTrend> =>
  get(`/api/country/${iso3}/trend`);
